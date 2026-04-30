# Módulo: Firebase Actions

## Responsabilidad
Centraliza todas las operaciones de Firestore (lecturas, escrituras, transacciones) separadas por dominio de datos (ej. employees, attendance, tardiness). Mantiene el acceso a datos independiente de la UI.

## Estructura
Este directorio contiene archivos agrupados por contexto. Se favorece la segmentación de archivos grandes para evitar acoplamientos (Ej. `tardiness-actions.ts` se separó en `early-departure-actions.ts` y `missing-punch-actions.ts`).

## Archivos clave recientes
- `tardiness-actions.ts` — Registro y justificación de retardos exclusivamente.
- `early-departure-actions.ts` — Registro y justificación de salidas tempranas.
- `missing-punch-actions.ts` — Registro y justificación de marcajes faltantes.
- `incidence-actions.ts` — Barrel que re-exporta funciones de dominios relacionados para facilitar importaciones legacy.

## Notas
No regeneres lógicas de acceso a datos si ya existe un helper aquí. Siempre busca primero en estos archivos.
