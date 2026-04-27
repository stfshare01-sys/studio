/**
 * Módulo: Biblioteca (Org Documents)
 * Tipos internos del módulo — no expone tipos HCM al resto de la app
 */

export type DocumentFileType = 'pdf' | 'word';

export type DocumentCategory =
  | 'policy'       // Políticas
  | 'manual'       // Manuales
  | 'procedure'    // Procedimientos
  | 'form'         // Formatos
  | 'other';       // Otros

/**
 * Documento organizacional almacenado en Firestore `/org_documents/{id}`
 *
 * Control de acceso aditivo:
 * - visibleToDepartments vacío = visible para toda la empresa
 * - visibleToUserIds vacío = sin asignación individual explícita
 * - Si cualquiera de las dos listas contiene al usuario → acceso concedido
 */
export interface OrgDocument {
  id: string;
  title: string;
  description?: string;
  category: DocumentCategory;
  fileType: DocumentFileType;
  /** Nombre del archivo original subido */
  fileName: string;
  /** URL de descarga de Firebase Storage */
  downloadUrl: string;
  /** Ruta interna en Storage (para borrado) */
  storagePath: string;
  /** Departamentos que pueden ver el documento. Vacío = todos */
  visibleToDepartments: string[];
  /** UIDs de usuarios con acceso explícito individual */
  visibleToUserIds: string[];
  uploadedByUid: string;
  uploadedByName: string;
  /** YYYY-MM-DD — sin conversión UTC, zona horaria Guadalajara */
  uploadedAt: string;
  updatedAt: string;
  /** Tamaño en bytes */
  fileSizeBytes: number;
}

/** Payload para crear un documento nuevo */
export type CreateOrgDocumentPayload = Omit<OrgDocument, 'id'>;

/** Payload para actualizar metadata (no el archivo) */
export type UpdateOrgDocumentPayload = Partial<
  Pick<OrgDocument, 'title' | 'description' | 'category' | 'visibleToDepartments' | 'visibleToUserIds'>
> & { updatedAt: string };

// ─────────────────────────────────────────────────────────────────
// RAG — Chunks de texto para el bot de Biblioteca
// ─────────────────────────────────────────────────────────────────

/** Estado del proceso de indexación del documento */
export type IndexingStatus = 'pending' | 'processing' | 'indexed' | 'error';

/**
 * Fragmento de texto extraído de un OrgDocument.
 * Almacenado en `/doc_chunks/{chunkId}`.
 *
 * Los arrays de acceso son copia exacta del documento padre
 * para aplicar el mismo control aditivo en las búsquedas del bot.
 */
export interface DocChunk {
  id: string;
  /** ID del documento padre en org_documents */
  documentId: string;
  /** Título del documento padre (para incluir en la respuesta del bot) */
  documentTitle: string;
  /** Categoría del padre (para filtrar por tipo en el bot) */
  documentCategory: DocumentCategory;
  /** Posición del chunk dentro del documento (0-indexed) */
  chunkIndex: number;
  /** Texto plano del fragmento — lo que el LLM leerá */
  content: string;
  /**
   * Embedding vectorial generado por text-embedding-004.
   * Firestore Vector Search usa este campo para búsqueda semántica.
   */
  embedding: number[];
  /** Copias del control de acceso del padre — se filtran antes de buscar */
  visibleToDepartments: string[];
  visibleToUserIds: string[];
  /** YYYY-MM-DD — fecha en que se indexó este chunk */
  indexedAt: string;
}

/** Resultado de una búsqueda semántica — chunk + score de similitud */
export interface ChunkSearchResult {
  chunk: DocChunk;
  /** Score de similitud coseno (0-1) — mayor es más relevante */
  score: number;
}

/**
 * Estado de indexación guardado en el documento padre `org_documents`.
 * Se añade al documento existente después de procesarlo.
 */
export interface OrgDocumentIndexingState {
  indexingStatus: IndexingStatus;
  indexedChunks?: number;
  indexingError?: string;
  indexedAt?: string;
}
