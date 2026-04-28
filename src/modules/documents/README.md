# Módulo: Biblioteca (org_documents)

## Responsabilidad
Almacenar, controlar y distribuir documentos organizacionales (políticas, manuales, procedimientos y formatos) con control de visibilidad granular por departamento o usuario individual. Además, proporciona un asistente de IA (RAG) que responde dudas basándose exclusivamente en los documentos a los que el usuario tiene acceso.

## Colecciones de Firestore
- `org_documents` — Metadata de cada documento: título, categoría, tipo de archivo, URL de descarga, ruta en Storage, y arrays de acceso por departamento/usuario.
- `doc_chunks` — Fragmentos de texto extraídos de los documentos y sus correspondientes embeddings vectoriales, utilizados para la búsqueda semántica.

## Ruta de Storage
- `org_documents/{timestamp}_{filename}` — Archivos físicos. Soporta PDF y Word (.doc, .docx). Límite: 50 MB por archivo.

## Dependencias externas
- **HCM** — vía `department-actions.ts` (HCM) — Lee departamentos activos para el selector de permisos en el modal de subida. Solo lectura, sin adaptador propio porque ya es una query pública del sistema.
- **Genkit & Gemini API** — Para la generación de embeddings y las respuestas del chat, utilizando el modelo `gemini-1.5-flash` y `text-embedding-004`.

## Lógica de acceso (aditiva)
Un documento (y sus fragmentos para la IA) es visible para un usuario si **cualquiera** de estas condiciones se cumple:
1. `visibleToDepartments` y `visibleToUserIds` están **vacíos** → visible para toda la empresa
2. El `department` del empleado en Firestore está en `visibleToDepartments`
3. El `uid` del usuario está en `visibleToUserIds`

> Regla de Firestore: `isUnrestricted() || isInAllowedDepartment() || isExplicitlyAllowed()`

## Búsqueda Semántica con IA (RAG)
1. Al subir un documento, la Cloud Function `onOrgDocumentCreated` se dispara automáticamente.
2. Extrae el texto del documento (vía Gemini Vision API para PDFs o `adm-zip` para Word).
3. Divide el texto en fragmentos (chunks) y genera embeddings vectoriales.
4. Los vectores se guardan en la colección `doc_chunks` heredando los permisos del documento original.
5. El chat de la UI envía preguntas a un endpoint que usa Firebase Genkit para buscar los fragmentos más relevantes y generar una respuesta fundamentada con citas.

## Lo que este módulo NO hace
- No gestiona versiones de documentos (una subida = un documento nuevo)
- No convierte formatos (Word se descarga como Word, PDF se previsualiza)
- No envía notificaciones al publicar un documento
- No integra firmas digitales ni flujos de aprobación (ese es territorio de BPMN)

## Archivos clave
- `documents.types.ts` — Tipos `OrgDocument`, `DocChunk`, payloads y configuración.
- `documents-queries.ts` — `getAllOrgDocuments()` — lista todos los documentos del usuario autenticado.
- `documents-mutations.ts` — Mutaciones para gestionar documentos.
- `src/ai/flows/biblioteca-rag.ts` — Flujo de Firebase Genkit para procesar consultas de IA.
- `functions/src/triggers/onOrgDocumentCreated.ts` — Pipeline de extracción y generación de embeddings.

## UI — Rutas y componentes
- `src/app/biblioteca/page.tsx` — Página principal: chat integrado de IA, búsqueda, filtro por categoría, grid de tarjetas.
- `src/app/biblioteca/components/BibliotecaChat.tsx` — Interfaz de chat con el asistente virtual de la biblioteca.
- `src/app/biblioteca/components/DocumentCard.tsx` — Tarjeta: previsualiza PDF en nueva pestaña, descarga Word directamente.
- `src/app/biblioteca/components/DocumentUploadModal.tsx` — Modal de subida con selectores de permisos.

## Permisos por rol
| Rol | Nivel |
|---|---|
| Admin | write (subir, actualizar, eliminar) |
| HRManager | write (subir, actualizar, eliminar) |
| Manager | read |
| Member | read |
| Designer | read |

## Estado actual
- [x] En producción (Módulo Base y AI Chat)
- Implementado: 2026-04-28
