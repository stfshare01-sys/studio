# Módulo: Team Management

## Responsabilidad

Dashboard de gestión de equipo para líderes/managers. Permite supervisar
retardos, salidas tempranas, marcajes faltantes, tiempo extra, turnos y bolsa
de horas de sus subordinados directos.

---

## Arquitectura (Patrón Orquestador)

Este módulo usa el patrón **Orquestador → Hook → Tabs + Modales**.
**No agregar lógica de negocio directamente en `page.tsx`.**

```
team-management/
├── page.tsx                          ← Orquestador puro: solo renderiza, no tiene lógica
├── utils.ts                          ← Utilidades de formato (formatDateDDMMYYYY, etc.)
├── hooks/
│   └── use-team-management.ts        ← TODA la lógica de estado y negocio del módulo
├── components/
│   ├── tabs/                         ← Un componente por cada tab del dashboard
│   │   ├── TeamOverviewTab.tsx
│   │   ├── TeamTardinessTab.tsx
│   │   ├── TeamEarlyDeparturesTab.tsx
│   │   ├── TeamMissingPunchesTab.tsx
│   │   ├── TeamOvertimeTab.tsx
│   │   ├── TeamShiftsTab.tsx
│   │   └── TeamHourBankTab.tsx
│   └── modals/                       ← Un componente por cada diálogo/modal
│       ├── JustifyTardinessDialog.tsx
│       ├── JustifyDepartureDialog.tsx
│       ├── JustifyMissingPunchDialog.tsx
│       ├── OvertimeApprovalDialog.tsx
│       ├── ShiftAssignmentDialog.tsx
│       ├── CancelShiftDialog.tsx
│       ├── ShiftHistoryDialog.tsx
│       └── HourBankHistoryDialog.tsx
```

---

## Reglas de desarrollo en este módulo

1. **Nueva tab** → crear en `components/tabs/`, importar en `page.tsx`
2. **Nuevo modal** → crear en `components/modals/`, importar en `page.tsx`
3. **Nueva lógica de estado** → agregar al hook `use-team-management.ts`, exponer desde ahí
4. **`page.tsx` no debe superar ~600 líneas** — si crece, el hook o un tab necesita más lógica
5. **Adaptadores de firma** → `page.tsx` contiene wrappers (`hasPermissionAdapter`, `setStatusFilterAdapter`) que traducen tipos estrictos del hook a las interfaces de los tabs. Seguir ese patrón al agregar nuevos.

---

## Colecciones de Firestore que usa

| Colección | Uso |
|---|---|
| `employees` | Lista de subordinados del manager |
| `attendance` | Registros de asistencia del equipo |
| `missingPunches` | Marcajes faltantes |
| `tardinessRecords` | Retardos del equipo |
| `earlyDepartures` | Salidas tempranas |
| `overtimeRequests` | Solicitudes de tiempo extra |
| `hourBanks` | Bolsa de horas por empleado |
| `hourBankMovements` | Historial de movimientos de bolsa |
| `shiftAssignments` | Asignaciones de turno |
| `shifts` | Catálogo de turnos disponibles |

---

## Hook principal: `useTeamManagement`

**Archivo:** `hooks/use-team-management.ts` (~1,251 líneas)

Exporta todo el estado y los handlers del módulo. Antes de agregar lógica
nueva, verificar que no exista ya un handler en este hook.

### Handlers principales que expone

| Handler | Qué hace |
|---|---|
| `handleJustifyTardiness()` | Justifica un retardo seleccionado |
| `handleJustifyDeparture()` | Justifica una salida temprana |
| `handleJustifyMissingPunch()` | Justifica un marcaje faltante |
| `handleMarkTardinessUnjustified(record)` | Marca retardo como injustificado |
| `handleMarkDepartureUnjustified(record)` | Marca salida temprana como injustificada |
| `handleMarkMissingPunchAsFault(record)` | Marca marcaje faltante como falta |
| `handleApproveOvertime(approve)` | Aprueba o rechaza una solicitud de HE |
| `handleAssignShift(employeeId)` | Asigna turno a un empleado |
| `handleCancelShiftAssignment(assignmentId)` | Cancela asignación de turno |
| `handleViewShiftHistory(employee)` | Abre historial de turnos |
| `handleViewHourBankHistory(employee)` | Abre historial de bolsa de horas |

---

## Dependencias externas

- **`@/firebase/actions/hour-bank-actions`** — `formatHourBankBalance`, `getTeamHourBanks`
- **`@/firebase/actions/employee-actions`** — `migrateManagerIdField`
- **`@/firebase/role-actions`** — `hasPermission`
- **`@/hooks/use-permissions`** — `usePermissions`
- **`@/lib/types`** — `Employee`, `HourBank`, `OvertimeRequest`, `ShiftType`
- **`@/types/hcm-operational`** — `MissingPunchRecord`, `TardinessRecord`, `EarlyDepartureRecord`

---

## Lo que este módulo NO hace

- No modifica datos de compensación de empleados
- No genera períodos de prenómina (eso es `prenomina/`)
- No administra el catálogo de turnos (eso es `admin/shifts/`)
- No tiene acceso a empleados fuera del reporte directo del manager

---

## Estado actual

- [x] En producción
- [x] Refactorizado con patrón orquestador (Abril 2026)
- [ ] Tests automatizados pendientes
