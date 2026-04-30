# Módulo: Prenómina (Consolidación de Asistencia)

## Responsabilidad
Revisar y cerrar períodos de asistencia para que el área de nómina pueda procesar pagos.
Genera el archivo NomiPAQ (Formato 1) y reportes oficiales en PDF/ZIP.

## Arquitectura

Patrón: **Orquestador + Hook + Componentes + Utils**

```
prenomina/
├── page.tsx                          ← Orquestador (~160 líneas). Solo conecta hook ↔ UI.
├── hooks/
│   └── use-prenomina.ts              ← Todo el estado y handlers del módulo
├── components/
│   ├── PeriodSelector.tsx            ← Selectores de período/entidad + botones de acción
│   ├── PendingCountsCard.tsx         ← Panel de pendientes por justificar
│   ├── PrenominaRecordsTable.tsx     ← Tabla de registros con botón de detalle
│   ├── EmployeeDetailDialog.tsx      ← Dialog con breakdown de días por empleado
│   └── ConsolidateDialog.tsx         ← Dialog de confirmación de cierre de período
└── utils/
    ├── nomipaq-export.ts             ← generateNomipaqLines() + downloadTextFile()
    └── prenomina-utils.tsx           ← formatDate(), getStatusBadge()
```

## Colecciones de Firestore

| Colección | Acceso | Descripción |
|---|---|---|
| `prenomina` | read/write | Registros por empleado y período |
| `attendance` | read | Marcajes de asistencia (para NomiPAQ) |
| `incidences` | read | Permisos aprobados (VAC, INC, PCS...) |
| `employees` | read | Datos de empleado + número NomiPAQ |
| `custom_shifts` | read | Días de descanso por turno |
| `holiday_calendars` | read | Días festivos del año |
| `overtime_requests` | read | Solicitudes de tiempo extra |
| `tardiness_records` | read | Retardos pendientes de justificar |
| `early_departures` | read | Salidas anticipadas pendientes |
| `missing_punches` | read | Marcajes faltantes |
| `manager_review_status` | read | Estado de revisión por manager |

## Actions de Firebase utilizadas

- `checkPeriodLock` / `lockPayrollPeriod` — `@/firebase/actions/report-actions`
- `getPendingIncidences` — `@/firebase/actions/prenomina-actions`
- `runGlobalSLAProcessing` — `@/firebase/actions/sla-actions`
- `callConsolidatePrenomina` / `callGeneratePayrollReports` — `@/firebase/callable-functions`

## Flujo de cierre de período (`handleClosePeriod`)

1. Verificar que el período no esté ya bloqueado (`checkPeriodLock`)
2. Validar que no haya permisos pendientes (`getPendingIncidences`)
3. Ejecutar SLA para infracciones no justificadas (`runGlobalSLAProcessing`)
4. Consolidar prenómina en Cloud Function (`callConsolidatePrenomina`)
5. Bloquear el período (`lockPayrollPeriod`)
6. Actualizar estado de registros en batch a `locked`

## Exportación NomiPAQ (`nomipaq-export.ts`)

Genera un archivo `.txt` con formato `EMPLEADO|FECHA|CODIGO|VALOR`.
Códigos soportados: `NOMIPAQ_CODES` de `@/types/hcm-operational`.
La función `generateNomipaqLines()` solo lee Firestore — no hace escrituras.

## Dependencias externas

- Ningún otro módulo (HCM, BPMN, CRM) depende de colecciones propias de prenomina.
- Prenomina lee `employees`, `attendance` e `incidences` — colecciones core de HCM.

## Estado actual

- [x] En producción
- [x] Refactorizado al patrón orquestador (2026-04-30)
- [ ] TODO: Migrar `new Date().toISOString()` a `serverTimestamp()` en handleClosePeriod
