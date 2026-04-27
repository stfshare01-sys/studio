/**
 * Cloud Function: onOrgDocumentCreated
 * Módulo: Biblioteca — RAG Indexing Pipeline
 *
 * Trigger: onCreate en /org_documents/{docId}
 * Responsabilidad: Extrae texto del archivo en Storage, divide en chunks,
 * genera embeddings con Gemini text-embedding-004 y los guarda en /doc_chunks.
 *
 * NO modifica la lógica de subida del cliente — reacciona al documento creado.
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Tamaño máximo de cada chunk en caracteres
const CHUNK_SIZE = 1500;
// Solapamiento entre chunks para no perder contexto en los bordes
const CHUNK_OVERLAP = 200;
// Modelo de embedding de Gemini
const EMBEDDING_MODEL = 'text-embedding-004';

interface OrgDocumentData {
  title: string;
  category: string;
  fileType: 'pdf' | 'word';
  storagePath: string;
  visibleToDepartments: string[];
  visibleToUserIds: string[];
}

/**
 * Divide texto en chunks con solapamiento.
 * Intenta cortar en salto de párrafo o punto para no truncar oraciones.
 */
function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Intentar cortar en salto de línea o punto para no truncar oraciones
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n', end);
      const lastDot = text.lastIndexOf('. ', end);
      const breakPoint = Math.max(lastBreak, lastDot);
      if (breakPoint > start + size * 0.6) {
        end = breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) { // Ignorar chunks demasiado cortos
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Genera embedding vectorial usando la API de Gemini vía REST.
 * Firestore Vector Search requiere embeddings de dimensión fija (768).
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error: ${response.status} — ${err}`);
  }

  const data = await response.json() as { embedding: { values: number[] } };
  return data.embedding.values;
}

/**
 * Extrae texto plano de un PDF usando la API de Gemini (multimodal).
 * Word (.docx) se procesa extrayendo el XML interno del zip.
 */
async function extractTextFromStorage(
  storagePath: string,
  fileType: 'pdf' | 'word',
  apiKey: string
): Promise<string> {
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [buffer] = await file.download();

  if (fileType === 'pdf') {
    // Gemini puede leer PDFs directamente — lo enviamos como base64
    const base64 = buffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: base64,
              },
            },
            {
              text: 'Extrae TODO el texto de este documento PDF. Devuelve solo el texto plano sin formato markdown ni comentarios. Preserva saltos de párrafo.',
            },
          ],
        }],
      }),
    });

    if (!response.ok) throw new Error(`PDF extraction error: ${response.status}`);
    const data = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  } else {
    // Word: extraer texto del XML interno del .docx (es un ZIP)
    // Importación dinámica para evitar bundling en funciones que no lo necesitan
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) throw new Error('No se encontró word/document.xml en el .docx');

    const xml = entry.getData().toString('utf8');
    // Extraer texto entre tags <w:t> y limpiar XML
    const text = xml
      .replace(/<w:br[^/]\/>/g, '\n')           // saltos de línea
      .replace(/<w:p[ >][^>]*>/g, '\n')          // párrafos
      .replace(/<[^>]+>/g, '')                   // quitar todos los tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')               // colapsar líneas vacías excesivas
      .trim();

    return text;
  }
}

export const onOrgDocumentCreated = functions.firestore.onDocumentCreated(
  'org_documents/{docId}',
  async (event) => {
    const db = admin.firestore();
    const docId = event.params.docId;
    const data = event.data?.data() as OrgDocumentData | undefined;

    if (!data) {
      console.error('[Biblioteca] onOrgDocumentCreated: documento sin data', docId);
      return;
    }

    // Marcar como en proceso
    await db.collection('org_documents').doc(docId).update({
      indexingStatus: 'processing',
    });

    try {
      const apiKey = process.env.GOOGLE_GENAI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY no configurada en Functions env');

      // 1. Extraer texto del archivo
      console.log(`[Biblioteca] Extrayendo texto de ${data.storagePath} (${data.fileType})`);
      const fullText = await extractTextFromStorage(data.storagePath, data.fileType, apiKey);

      if (!fullText || fullText.trim().length < 50) {
        throw new Error('Texto extraído insuficiente — el documento puede estar vacío o ser solo imágenes');
      }

      // 2. Dividir en chunks
      const textChunks = chunkText(fullText, CHUNK_SIZE, CHUNK_OVERLAP);
      console.log(`[Biblioteca] ${textChunks.length} chunks generados para docId=${docId}`);

      // 3. Generar embeddings y guardar chunks en Firestore
      const today = new Date().toISOString().split('T')[0];
      const batch = db.batch();

      for (let i = 0; i < textChunks.length; i++) {
        const embedding = await generateEmbedding(textChunks[i], apiKey);

        const chunkRef = db.collection('doc_chunks').doc();
        batch.set(chunkRef, {
          documentId: docId,
          documentTitle: data.title,
          documentCategory: data.category,
          chunkIndex: i,
          content: textChunks[i],
          // Firestore Vector Search requiere el tipo VectorValue
          embedding: FieldValue.vector(embedding),
          visibleToDepartments: data.visibleToDepartments,
          visibleToUserIds: data.visibleToUserIds,
          indexedAt: today,
        });

        // Commit por lotes de 200 para no superar límite de Firestore
        if ((i + 1) % 200 === 0) {
          await batch.commit();
        }
      }

      await batch.commit();

      // 4. Actualizar estado en documento padre
      await db.collection('org_documents').doc(docId).update({
        indexingStatus: 'indexed',
        indexedChunks: textChunks.length,
        indexedAt: today,
      });

      console.log(`[Biblioteca] Indexación completada — ${textChunks.length} chunks para docId=${docId}`);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Biblioteca] Error en indexación de docId=${docId}:`, message);

      await db.collection('org_documents').doc(docId).update({
        indexingStatus: 'error',
        indexingError: message,
      });
    }
  }
);
