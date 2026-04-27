/**
 * Flujo Genkit: Biblioteca RAG
 * Módulo: Biblioteca — Bot de consulta de documentos organizacionales
 *
 * Recibe: pregunta del usuario + contexto de acceso (departamento, uid)
 * Proceso: genera embedding → busca chunks accesibles → responde con Gemini
 * Retorna: respuesta en texto + fuentes citadas
 *
 * El control de acceso se aplica ANTES de la búsqueda semántica,
 * nunca después — siguiendo el principio de mínimo privilegio.
 */

import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';

// Schema de entrada del flujo
const BibliotecaQueryInputSchema = z.object({
  /** Pregunta del usuario en lenguaje natural */
  question: z.string().min(3).max(500),
  /** Departamento del usuario (del perfil de empleado) */
  userDepartment: z.string().optional(),
  /** UID de Firebase Auth del usuario */
  userId: z.string(),
  /** Categorías opcionales para filtrar (policy, manual, etc.) */
  categories: z.array(z.string()).optional(),
});

// Schema de salida
const BibliotecaQueryOutputSchema = z.object({
  /** Respuesta del bot en lenguaje natural */
  answer: z.string(),
  /** Documentos fuente utilizados para generar la respuesta */
  sources: z.array(z.object({
    documentId: z.string(),
    documentTitle: z.string(),
    excerpt: z.string(), // fragmento relevante del chunk
  })),
  /** true si no se encontraron chunks relevantes para la pregunta */
  noDocumentsFound: z.boolean(),
});

export type BibliotecaQueryInput = z.infer<typeof BibliotecaQueryInputSchema>;
export type BibliotecaQueryOutput = z.infer<typeof BibliotecaQueryOutputSchema>;

/**
 * Genera embedding de la pregunta del usuario usando Gemini text-embedding-004.
 * Mismo modelo que se usó al indexar — garantiza compatibilidad vectorial.
 */
async function embedQuestion(question: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY no configurada');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: question }] },
    }),
  });

  if (!response.ok) throw new Error(`Embedding error: ${response.status}`);
  const data = await response.json() as { embedding: { values: number[] } };
  return data.embedding.values;
}

/**
 * Calcula similitud coseno entre dos vectores.
 * Retorna valor entre 0 (ninguna similitud) y 1 (idénticos).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

/**
 * Flujo principal del bot de Biblioteca.
 *
 * Aplica control de acceso aditivo antes de buscar:
 * - Chunks sin restricciones → siempre accesibles
 * - Chunks restringidos por dept → solo si dept del usuario coincide
 * - Chunks restringidos por uid → solo si uid del usuario está en la lista
 *
 * @example
 * const result = await bibliotecaRagFlow({
 *   question: '¿Cuáles son los días de vacaciones según la política?',
 *   userId: 'abc123',
 *   userDepartment: 'Recursos Humanos',
 * });
 */
export const bibliotecaRagFlow = ai.defineFlow(
  {
    name: 'bibliotecaRag',
    inputSchema: BibliotecaQueryInputSchema,
    outputSchema: BibliotecaQueryOutputSchema,
  },
  async (input) => {
    const db = getFirestore();

    // 1. Generar embedding de la pregunta
    const questionEmbedding = await embedQuestion(input.question);

    // 2. Obtener chunks accesibles para este usuario
    //    Se recuperan todos los indexados y se filtra en cliente por acceso.
    //    (Firestore Vector Search con filtros aditivos OR requiere índice especial;
    //    para el volumen actual de documentos empresariales, el filtro en cliente es viable)
    const chunksRef = collection(db, 'doc_chunks');
    let chunksQuery = query(chunksRef, orderBy('indexedAt', 'desc'), limit(500));

    if (input.categories && input.categories.length > 0) {
      chunksQuery = query(
        chunksRef,
        where('documentCategory', 'in', input.categories),
        orderBy('indexedAt', 'desc'),
        limit(500)
      );
    }

    const snap = await getDocs(chunksQuery);

    // 3. Filtrar por acceso del usuario (misma lógica que Firestore rules)
    interface RawChunk {
      documentId: string;
      documentTitle: string;
      documentCategory: string;
      chunkIndex: number;
      content: string;
      embedding: number[];
      visibleToDepartments: string[];
      visibleToUserIds: string[];
      indexedAt: string;
    }

    const accessibleChunks = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as RawChunk & { id: string }))
      .filter(chunk => {
        const isUnrestricted =
          chunk.visibleToDepartments.length === 0 &&
          chunk.visibleToUserIds.length === 0;

        const deptMatch =
          input.userDepartment &&
          chunk.visibleToDepartments.includes(input.userDepartment);

        const userMatch = chunk.visibleToUserIds.includes(input.userId);

        return isUnrestricted || deptMatch || userMatch;
      });

    if (accessibleChunks.length === 0) {
      return {
        answer: 'No encontré documentos disponibles para responder tu pregunta. Es posible que no tengas acceso a los documentos relacionados o que aún no existan en la Biblioteca.',
        sources: [],
        noDocumentsFound: true,
      };
    }

    // 4. Calcular similitud semántica y tomar los top-5 más relevantes
    const ranked = accessibleChunks
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(questionEmbedding, chunk.embedding),
      }))
      .filter(r => r.score > 0.6) // umbral mínimo de relevancia
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (ranked.length === 0) {
      return {
        answer: 'No encontré información relevante en la Biblioteca para tu pregunta. Intenta reformularla o consulta directamente los documentos disponibles.',
        sources: [],
        noDocumentsFound: true,
      };
    }

    // 5. Construir contexto para el LLM
    const context = ranked
      .map((r, i) =>
        `[Fuente ${i + 1}: "${r.chunk.documentTitle}"]\n${r.chunk.content}`
      )
      .join('\n\n---\n\n');

    // 6. Generar respuesta con Gemini
    const { text } = await ai.generate({
      prompt: `Eres el asistente interno de Stuffactory. Tu función es responder preguntas de los empleados basándote ÚNICAMENTE en los documentos organizacionales proporcionados.

REGLAS:
- Responde solo con información de los documentos. Si la información no está, dilo claramente.
- Sé conciso y directo. Usa viñetas si hay múltiples puntos.
- Cita qué documento tiene la información (ej: "Según el Manual de Vacaciones...").
- No inventes información ni uses conocimiento externo.
- Responde en español.

CONTEXTO (documentos disponibles):
${context}

PREGUNTA DEL EMPLEADO:
${input.question}

RESPUESTA:`,
    });

    // 7. Deduplicar fuentes por documentId
    const seenDocs = new Set<string>();
    const sources = ranked
      .filter(r => {
        if (seenDocs.has(r.chunk.documentId)) return false;
        seenDocs.add(r.chunk.documentId);
        return true;
      })
      .map(r => ({
        documentId: r.chunk.documentId,
        documentTitle: r.chunk.documentTitle,
        excerpt: r.chunk.content.slice(0, 200) + '...',
      }));

    return {
      answer: text,
      sources,
      noDocumentsFound: false,
    };
  }
);
