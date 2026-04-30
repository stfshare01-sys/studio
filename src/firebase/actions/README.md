# Módulo: Firebase Actions (Data Access Layer)

## Responsabilidad
Centraliza todas las operaciones de Firestore (lecturas, escrituras, transacciones) separadas por dominio de datos (ej. employees, attendance, tardiness) para mantener el acceso a datos independiente de la UI y fuertemente tipado.

## Colecciones de Firestore
- **Múltiples colecciones** — Este directorio interactúa con casi todas las colecciones principales de HCM (employees, attendance, tardiness_records, early_departures, missing_punches, prenomina, custom_shifts, etc.).

## Dependencias externas
- Depende de los tipos definidos en `src/types/` (`hcm.types.ts`, `auth.types.ts`, `workflow.types.ts`).
- Expone contratos de datos para ser consumidos por los hooks y componentes de los distintos módulos (ej. `team-management`, `prenomina`, `my-attendance`).

## Lo que este módulo NO hace
- No contiene lógica de UI, estado de React (useState, useEffect) ni llamadas a hooks de React.
- No contiene reglas de ruteo ni navegación.
- No debe importar de carpetas `src/app/` ni dependencias específicas de vistas.

## Archivos clave
- `employee-actions.ts` — Queries y mutaciones base de empleados.
- `team-queries.ts` / `team-attendance-queries.ts` — Lógica de lectura para la vista de gestión de equipos (incluye consultas para periodos específicos y registros pendientes).
- `tardiness-actions.ts` — Registro y justificación de retardos exclusivamente.
- `early-departure-actions.ts` — Registro y justificación de salidas tempranas.
- `missing-punch-actions.ts` — Registro y justificación de marcajes faltantes.
- `incidence-actions.ts` — Archivo de conveniencia que agrupa dominios de incidencias.
- `hour-bank-actions.ts` / `vacation-balance-actions.ts` / `compensation-actions.ts` — Dominios de saldos, horas acumuladas y compensaciones.
- `sla-actions.ts` — Procesamiento global de infracciones (SLA).

## Estado actual
- [x] En producción
- [x] Refactorizado para segmentación estricta de dominios
