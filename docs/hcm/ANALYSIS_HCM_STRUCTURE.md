# Análisis de Estructura: Módulo HCM — Acciones Firebase

Este documento detalla la organización actual de las acciones de Firebase (queries, mutations y utils) dentro del módulo HCM, siguiendo las reglas de [Module boundaries](../../.agent/rules/Module%20boundaries.md) y [Search before write](../../.agent/rules/Search%20before%20write.md).

## Ubicación Canónica
Todas las acciones de backend se encuentran en: `src/firebase/actions/`

## 1. Gestión de Empleados (`employee-actions.ts`)
Responsable del ciclo de vida del empleado y consultas de perfil individual.

| Función | Tipo | Descripción |
|---|---|---|
| `getEmployeeByUserId(userId)` | Query | Perfil completo. El ID del empleado coincide con el UID de Firebase Auth. |
| `createEmployee(userId, payload)` | Mutation | Registro maestro. Sincroniza campos clave con la colección `users`. |
| `deactivateEmployee(id, date)` | Mutation | Baja administrativa ('BJ'). Marca `status: disabled`. |
| `blacklistEmployee(id, reason)` | Mutation | Baja con restricción de recontratación (`isBlacklisted: true`). |
| `updateOnboardingStatus(id, phase)` | Mutation | Avance en el flujo de ingreso (`day_0` a `day_90`). |
| `getApprovalLimit(posId, type)` | Query | Consulta límites financieros/operativos del puesto (consumido por BPMN). |
| `getUpcomingLeaves(id)` | Query | Incidencias futuras para validación de disponibilidad. |

## 2. Estructura y Equipo (`team-queries.ts`)
Lógica para navegación jerárquica y organigrama.

- `getDirectReports(managerId)`: Subordinados directos.
- `getHierarchicalReports(managerId, maxDepth)`: Toda la cadena de mando (recursivo).
- `hasDirectReports(managerId)`: Determina si el usuario tiene rol de manager activo.

## 3. Asistencia y Tiempo (`tardiness-actions.ts`)
Gestión operativa de incidencias diarias (retardos, salidas, faltas de marcaje).

> [!IMPORTANT]
> Estas funciones están acopladas porque la resolución de un marcaje faltante puede desencadenar un retardo o una salida temprana.

| Función | Dominio | Descripción |
|---|---|---|
| `recordTardiness(...)` | Retardos | Registra retardo y aplica sanciones automáticas (strike system). |
| `justifyTardiness(...)` | Retardos | Permite compensar minutos vía **Bolsa de Horas**. |
| `recordEarlyDeparture(...)` | Salidas | Registra salida antes del horario de fin de turno. |
| `recordMissingPunch(...)` | Marcajes | Registro preventivo cuando falta entrada o salida en biometrico. |
| `justifyMissingPunch(...)` | Marcajes | **Core logic:** Resuelve la falta de marcaje pidiendo la hora real y validando contra el turno. |
| `syncMissingPunchesForEmployee(...)` | Sync | Detecta días sin marcajes y genera registros pendientes de justificar. |

## 4. Incidencias y Vacaciones (`incidence-core-actions.ts`)
Flujos de aprobación de solicitudes de ausencia.

- `createIncidence(payload)`:
  - Calcula días efectivos (omitiendo festivos/descansos).
  - Gestiona auto-aprobación si el solicitante es Manager/Admin.
  - Implementa **Escalación Automática** vía Cloud Function si el manager está ausente.
- `updateIncidenceStatus(...)`: Cierre de flujo. Si es aprobado, dispara `justifyInfractionsFromIncidence` para limpiar faltas previas.

## 5. Bolsa de Horas (`hour-bank-actions.ts`)
Sistema de compensación de tiempo.

- `addDebtToHourBank`: Carga minutos de deuda (ej. retardo justificado con tiempo).
- `addCreditToHourBank`: Carga minutos a favor (ej. tiempo extra autorizado).
- `getHourBankBalance`: Balance acumulado para visualización del empleado.

## 6. Procesamiento Global (`sla-actions.ts`)
Reglas de negocio automáticas (SLA).

- `runGlobalSLAProcessing`: Ejecuta barrido de registros pendientes.
  - Retardos de >24h sin justificar → Injustificados + Sanción.
  - Salidas tempranas → Injustificadas.
  - Tiempo extra pendiente → Se usa para pagar deuda en bolsa de horas primero.

## 7. Notificaciones (`notification-actions.ts`)
Sistema de alertas transversales.

- `createNotification`: Alerta directa a usuario.
- `notifyRole`: Alerta masiva a un rol (ej. todos los de RH ante una nueva incidencia sin manager).

---

## Tipos de Datos (Interfaces)
- **HCM Core:** `src/lib/types.ts` (`Employee`, `AttendanceRecord`, `Incidence`).
- **Operativo:** `src/types/hcm-operational.ts` (`MissingPunchRecord`).
- **Auth/RBAC:** `src/types/auth.types.ts` (`AppModule`, `UserRole`).

## Observaciones de Deuda Técnica
- Algunos archivos como `tardiness-actions.ts` superan las 900 líneas. Según la [regla de límites de tamaño](../../.agent/rules/reglas.md), estos archivos deben ser segmentados próximamente.
- Existe una inconsistencia histórica entre `managerId` y `directManagerId` que se está resolviendo vía `migrateManagerIdField`.
