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
