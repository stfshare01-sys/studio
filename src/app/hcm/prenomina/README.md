# Módulo: Prenómina (Consolidación de Asistencia)

## Responsabilidad
Revisar y cerrar períodos de asistencia para que el área de nómina pueda procesar pagos. Genera el archivo NomiPAQ (Formato 1) y reportes oficiales en PDF/ZIP.

## Colecciones de Firestore
- `prenomina` — Registros consolidados por empleado y período (read/write).
- `attendance` — Marcajes de asistencia para generación NomiPAQ (read).
- `incidences` — Permisos y justificaciones aprobadas (VAC, INC, PCS...) (read).
- `employees` — Datos maestros de empleado y número NomiPAQ (read).
- `custom_shifts` — Días de descanso configurados por turno (read).
- `holiday_calendars` — Días festivos oficiales del año (read).
- `overtime_requests` — Solicitudes de tiempo extra aprobadas o pendientes (read).
- `tardiness_records` — Retardos pendientes de justificar (read).
- `early_departures` — Salidas anticipadas pendientes (read).
- `missing_punches` — Marcajes faltantes pendientes (read).
- `manager_review_status` — Estado de revisión por manager (read).

## Dependencias externas
- **HCM Core** — Prenómina no tiene acoplamiento duro lateral, pero consume las acciones de Firebase (`@/firebase/actions/`) para lecturas de estado.
- **Backend / Cloud Functions** — Delega consolidación masiva vía `@/firebase/callable-functions` (`callConsolidatePrenomina`).

## Lo que este módulo NO hace
- No procesa solicitudes de tiempo extra ni justificaciones directamente (responsabilidad de Team Management y My Attendance).
- No modifica datos maestros de empleados, turnos ni horarios.
- No calcula compensaciones, deducciones financieras ni ISR; únicamente provee horas y días de asistencia efectivos.

## Archivos clave
- `page.tsx` — Orquestador que conecta estado (hook) y componentes visuales.
- `hooks/use-prenomina.ts` — Controlador central del estado y acciones del flujo de cierre.
- `utils/nomipaq-export.ts` — Lógica pura para generar layout NomiPAQ.
- `components/` — UI aislada (PeriodSelector, PrenominaRecordsTable, ConsolidateDialog).

## Estado actual
- [x] En producción
- [x] Refactorizado al patrón orquestador

