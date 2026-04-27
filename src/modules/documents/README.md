# Módulo: Biblioteca (org_documents)

## Responsabilidad
Almacenar, controlar y distribuir documentos organizacionales (políticas, manuales, procedimientos y formatos) con control de visibilidad granular por departamento o usuario individual.

## Colecciones de Firestore
- `org_documents` — Metadata de cada documento: título, categoría, tipo de archivo, URL de descarga, ruta en Storage, y arrays de acceso por departamento/usuario.

## Ruta de Storage
- `org_documents/{timestamp}_{filename}` — Archivos físicos. Soporta PDF y Word (.doc, .docx). Límite: 50 MB por archivo.

## Dependencias externas
- **HCM** — vía `department-actions.ts` (HCM) — Lee departamentos activos para el selector de permisos en el modal de subida. Solo lectura, sin adaptador propio porque ya es una query pública del sistema.

## Lógica de acceso (aditiva)
Un documento es visible para un usuario si **cualquiera** de estas condiciones se cumple:
1. `visibleToDepartments` y `visibleToUserIds` están **vacíos** → visible para toda la empresa
2. El `department` del empleado en Firestore está en `visibleToDepartments`
3. El `uid` del usuario está en `visibleToUserIds`

> Regla de Firestore: `isUnrestricted() || isInAllowedDepartment() || isExplicitlyAllowed()`

## Lo que este módulo NO hace
- No gestiona versiones de documentos (una subida = un documento nuevo)
- No convierte formatos (Word se descarga como Word, PDF se previsualiza)
- No envía notificaciones al publicar un documento
- No integra firmas digitales ni flujos de aprobación (ese es territorio de BPMN)

## Archivos clave
- `documents.types.ts` — Tipos `OrgDocument`, `CreateOrgDocumentPayload`, `UpdateOrgDocumentPayload`, `DocumentCategory`
- `documents-queries.ts` — `getAllOrgDocuments()` — lista todos los documentos del usuario autenticado
- `documents-mutations.ts` — `uploadOrgDocument()`, `updateOrgDocumentMetadata()`, `deleteOrgDocument()`

## UI — Rutas y componentes
- `src/app/biblioteca/page.tsx` — Página principal: búsqueda, filtro por categoría, grid de tarjetas
- `src/app/biblioteca/components/DocumentCard.tsx` — Tarjeta: previsualiza PDF en nueva pestaña, descarga Word directamente
- `src/app/biblioteca/components/DocumentUploadModal.tsx` — Modal: drag-drop, validación de tipo/tamaño, selector de categoría y departamentos

## Permisos por rol
| Rol | Nivel |
|---|---|
| Admin | write (subir, actualizar, eliminar) |
| HRManager | write (subir, actualizar, eliminar) |
| Manager | read |
| Member | read |
| Designer | read |

## Estado actual
- [x] En producción
- Implementado: 2026-04-27
