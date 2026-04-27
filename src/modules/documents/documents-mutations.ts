/**
 * Módulo: Biblioteca — Mutations de Firestore y Storage
 * Solo operaciones de escritura: crear, actualizar metadata y eliminar documentos.
 * NO hace queries — ver documents-queries.ts para lecturas.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
  UploadTaskSnapshot,
} from 'firebase/storage';
import type { CreateOrgDocumentPayload, UpdateOrgDocumentPayload, OrgDocument } from './documents.types';

const COLLECTION = 'org_documents';
const STORAGE_PATH = 'org_documents';

/**
 * Sube un archivo a Firebase Storage y crea el documento en Firestore.
 * Usa `serverTimestamp()` conforme a los estándares del proyecto.
 * La fecha YYYY-MM-DD se almacena como string `.split('T')[0]` (zona horaria Guadalajara).
 *
 * @param firestore - Instancia del cliente Firestore
 * @param storage - Instancia de Firebase Storage
 * @param file - Archivo a subir (PDF o Word)
 * @param payload - Metadata del documento (sin id, sin downloadUrl, sin storagePath)
 * @param onProgress - Callback opcional con % de progreso (0-100)
 * @returns El OrgDocument creado con su ID asignado
 */
export async function uploadOrgDocument(
  firestore: Firestore,
  storage: FirebaseStorage,
  file: File,
  payload: Omit<CreateOrgDocumentPayload, 'downloadUrl' | 'storagePath' | 'fileName' | 'fileSizeBytes' | 'uploadedAt' | 'updatedAt'>,
  onProgress?: (percent: number) => void
): Promise<OrgDocument> {
  // 1. Generar ruta única en Storage
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${STORAGE_PATH}/${timestamp}_${safeFileName}`;

  // 2. Subir archivo a Storage con reporte de progreso
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const downloadUrl = await new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (onProgress) {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(percent);
        }
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });

  // 3. Fecha local YYYY-MM-DD — regla: nunca .toISOString() completo (zona horaria Guadalajara UTC-6)
  const today = new Date().toISOString().split('T')[0];

  // 4. Crear documento en Firestore
  const docRef = collection(firestore, COLLECTION);
  const newDoc: Omit<OrgDocument, 'id'> = {
    ...payload,
    fileName: file.name,
    fileSizeBytes: file.size,
    downloadUrl,
    storagePath,
    uploadedAt: today,
    updatedAt: today,
  };

  const added = await addDoc(docRef, {
    ...newDoc,
    _serverTimestamp: serverTimestamp(), // para auditoría interna, no se usa en UI
  });

  return { id: added.id, ...newDoc };
}

/**
 * Actualiza solo la metadata de un documento existente (título, descripción, permisos).
 * NO reemplaza el archivo. Para reemplazar archivo, usar deleteOrgDocument + uploadOrgDocument.
 *
 * @param firestore - Instancia del cliente Firestore
 * @param documentId - ID del documento en Firestore
 * @param updates - Campos a actualizar
 */
export async function updateOrgDocumentMetadata(
  firestore: Firestore,
  documentId: string,
  updates: UpdateOrgDocumentPayload
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(firestore, COLLECTION, documentId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: today,
  });
}

/**
 * Elimina un documento organizacional de Firestore y su archivo de Storage.
 * Operación en dos pasos: primero Storage, luego Firestore.
 * Si falla Storage, el documento de Firestore NO se elimina para evitar referencias huérfanas.
 *
 * @param firestore - Instancia del cliente Firestore
 * @param storage - Instancia de Firebase Storage
 * @param documentId - ID del documento en Firestore
 * @param storagePath - Ruta del archivo en Storage (guardada en el documento)
 */
export async function deleteOrgDocument(
  firestore: Firestore,
  storage: FirebaseStorage,
  documentId: string,
  storagePath: string
): Promise<void> {
  // 1. Eliminar archivo de Storage primero
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);

  // 2. Solo si Storage tuvo éxito, eliminar de Firestore
  const docRef = doc(firestore, COLLECTION, documentId);
  await deleteDoc(docRef);
}
