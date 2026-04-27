/**
 * Módulo: Biblioteca — Queries de Firestore
 * Solo operaciones de lectura sobre la colección `org_documents`.
 * NO modifica datos — ver documents-mutations.ts para escrituras.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Firestore,
} from 'firebase/firestore';
import type { OrgDocument } from './documents.types';

const COLLECTION = 'org_documents';

/**
 * Obtiene todos los documentos organizacionales.
 * El cliente aplica filtro adicional según permisos de la UI.
 * La regla de Firestore ya restringe `get` por departamento/userId,
 * pero el `list` se usa para paginación y el filtro real ocurre en cliente.
 *
 * @param firestore - Instancia del cliente Firestore
 * @returns Lista de todos los OrgDocument ordenados por fecha descendente
 */
export async function getAllOrgDocuments(firestore: Firestore): Promise<OrgDocument[]> {
  const ref = collection(firestore, COLLECTION);
  const q = query(ref, orderBy('uploadedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgDocument));
}

/**
 * Obtiene un documento organizacional específico por su ID.
 * Lanza error si el documento no existe.
 *
 * @param firestore - Instancia del cliente Firestore
 * @param documentId - ID del documento en la colección `org_documents`
 * @returns OrgDocument o null si no existe
 */
export async function getOrgDocumentById(
  firestore: Firestore,
  documentId: string
): Promise<OrgDocument | null> {
  const ref = doc(firestore, COLLECTION, documentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as OrgDocument;
}

/**
 * Filtra documentos por categoría.
 * Útil para las tabs de la UI (Políticas, Manuales, etc.)
 *
 * @param firestore - Instancia del cliente Firestore
 * @param category - Categoría a filtrar
 * @returns Lista filtrada de OrgDocument
 */
export async function getOrgDocumentsByCategory(
  firestore: Firestore,
  category: OrgDocument['category']
): Promise<OrgDocument[]> {
  const ref = collection(firestore, COLLECTION);
  const q = query(
    ref,
    where('category', '==', category),
    orderBy('uploadedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgDocument));
}
