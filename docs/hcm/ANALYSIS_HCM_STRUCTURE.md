# Análisis de Estructura: Módulo HCM — Acciones Firebase

Este documento detalla la organización actual de las acciones de Firebase (queries, mutations y utils) dentro del módulo HCM, siguiendo las reglas de [Module boundaries](../../.agent/rules/Module%20boundaries.md) y [Search before write](../../.agent/rules/Search%20before%20write.md).

## Ubicación Canónica
Todas las acciones de backend se encuentran en: `src/firebase/actions/`

## 1. Gestión de Empleados (`employee-actions.ts`)
Responsable del ciclo de vida del empleado y consultas de perfil individual.

| Función | Tipo | Descripción |
|---|---|---|
| `getEmployeeByUserId(userId)` | Query | Perfil completo. El ID del empleado coincide con el UID de Firebase Auth. |
| `createEmployee(userId, payload)` | Mutation | Registro maestro. Sincroniza campos clave con la colección `users`. Acepta `workMode` y `homeOfficeDays`. |
| `deactivateEmployee(id, date)` | Mutation | Baja administrativa ('BJ'). Marca `status: disabled` en ambas colecciones: `employees` y `users`. |
| `blacklistEmployee(id, reason)` | Mutation | Baja con restricción de recontratación (`isBlacklisted: true`). |
| `updateOnboardingStatus(id, phase)` | Mutation | Avance en el flujo de ingreso (`day_0` a `day_90`). |
| `getApprovalLimit(posId, type)` | Query | Consulta límites financieros/operativos del puesto (consumido por BPMN). |
| `getUpcomingLeaves(id)` | Query | Consulta incidencias futuras (filtro por `employeeId` y `status`) para validación de disponibilidad. |

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
| `recordEarlyDeparture(...)` | Salidas | Registra salida antes del horario de fin de turno. La vista de equipo usa `earlyDepartureMinutes` y `justificationStatus` para su gestión. |
| `recordMissingPunch(...)` | Marcajes | Registro preventivo cuando falta entrada o salida en biometrico. |
| `justifyMissingPunch(...)` | Marcajes | **Core logic:** Resuelve la falta de marcaje pidiendo la hora real y validando contra el turno. |
| `syncMissingPunchesForEmployee(...)` | Sync | Detecta días sin marcajes y genera registros pendientes de justificar. |

## 4. Incidencias y Vacaciones (`incidence-core-actions.ts`)
Flujos de aprobación de solicitudes de ausencia.

> [!NOTE]
> El Home Office NO es una incidencia que se solicita por este flujo. Es una configuración administrativa fija (`homeOfficeDays` array numérico) dentro del perfil del empleado (`employee-actions.ts`). La política requiere que el empleado marque asistencia normalmente (check-in/check-out) en esos días, o el sistema generará una falta de marcaje (`missing_punch`).
>
> Para empleados con `workMode: 'remote'` o `workMode: 'field'`, el marcaje NO pasa por incidencias — usan el widget de auto-marcaje (`self-attendance-actions.ts`) que registra directamente en `attendance`.

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

## 7.5 Auto-Marcaje Digital (`self-attendance-actions.ts`)

Sistema de marcaje desde la app para empleados **sin checador físico**.

> [!IMPORTANT]
> Este módulo aplica para `workMode: 'remote'`, `'field'` y `'hybrid'`. Los empleados `'office'` siguen usando el checador físico (importación de asistencia masiva).

| Función | Descripción |
|---|---|
| `selfCheckIn(userId, employeeId, location?)` | Registra la entrada del día. Crea o actualiza el documento en `attendance`. Acepta coordenadas GPS opcionales para auditoría. |
| `selfCheckOut(userId, employeeId, location?)` | Registra la salida. Calcula y guarda `hoursWorked`. |

**Flujo de geolocalización (auditoría no bloqueante):**
- El hook `use-my-attendance.ts` solicita permiso GPS al montar solo para `remote`/`field`.
- Si el usuario acepta → las coordenadas `{ lat, lng }` se adjuntan al registro de `attendance`.
- Si el usuario deniega o el GPS falla → el marcaje se completa normalmente sin coordenadas.
- El campo `location` en `AttendanceRecord` es opcional; su ausencia no bloquea ningún flujo.

**Estado `gpsStatus` (expuesto por el hook):**

| Valor | Significado |
|---|---|
| `idle` | GPS pendiente de activar |
| `requesting` | Solicitando permiso al navegador |
| `granted` | Coordenadas disponibles |
| `denied` | Permiso denegado por el usuario |
| `unavailable` | Dispositivo sin soporte GPS |

---

## 7.6 Modalidades de Trabajo (`workMode`)

Campo en el perfil del empleado que controla el comportamiento del widget de marcaje.

| Valor | Descripción | Widget digital | Días HO configurables |
|---|---|---|---|
| `office` | Personal fijo en oficina con checador físico | ❌ No | ❌ No |
| `hybrid` | Oficina + días de Home Office fijos | ✅ Solo días HO | ✅ Sí |
| `remote` | 100% trabajo desde casa | ✅ Siempre | ❌ No aplica |
| `field` | Vendedores / visitas externas | ✅ Siempre | ❌ No aplica |

**Dónde se configura:**
- Alta de empleado: `employees/new/page.tsx` — Select "Modalidad de Trabajo"
- Edición: `employees/[id]/edit/page.tsx` — misma Card de Configuración de Asistencia
- Los días de HO (checkboxes) solo se muestran en la UI cuando `workMode === 'hybrid'`

**Impacto en Team Management:**
- La tabla de Missing Punches muestra badges `REM` / `CAM` con ícono 📍 junto al nombre del empleado cuando `workMode` es `remote` o `field`.

---

## Tipos de Datos (Interfaces)
- **HCM Core:** `src/lib/types.ts` (`Employee`, `AttendanceRecord`, `Incidence`).
  - `Employee` incluye los campos `workMode?: 'office' | 'hybrid' | 'remote' | 'field'` y `homeOfficeDays?: number[]`.
  - `AttendanceRecord` incluye `location?: { lat: number; lng: number }` para auditoría GPS.
  - Los campos `rfc` y `curp` son opcionales en el modelo `Employee` y `CreateEmployeePayload`.
- **Operativo:** `src/types/hcm-operational.ts` (`MissingPunchRecord`).
- **Auth/RBAC:** `src/types/auth.types.ts` (`AppModule`, `UserRole`).

## Archivos clave de UI

| Archivo | Descripción |
|---|---|
| `src/hooks/use-my-attendance.ts` | Hook principal del widget de marcaje. Maneja `workMode`, `captureLocation()`, `gpsStatus` y lógica de HO. |
| `src/components/hcm/my-attendance-widget.tsx` | Componente visual del widget, extraído de `my-attendance/page.tsx` para reutilización. |
| `src/app/hcm/my-attendance/page.tsx` | Página contenedora del widget. Carga el perfil del empleado y renderiza `<MyAttendanceWidget>`. |
| `src/app/hcm/team-management/page.tsx` | Dashboard de equipo. Muestra badges `REM`/`CAM` con MapPin en Missing Punches. |

## Observaciones de Deuda Técnica
- Algunos archivos como `tardiness-actions.ts` superan las 900 líneas. Según la [regla de límites de tamaño](../../.agent/rules/reglas.md), estos archivos deben ser segmentados próximamente.
- Existe una inconsistencia histórica entre `managerId` y `directManagerId` que se está resolviendo vía `migrateManagerIdField`.
