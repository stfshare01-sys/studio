# Module Boundaries — Referencia Adicional

Este archivo contiene detalles de implementación, como el mapa de colecciones de Firestore por módulo, checklists para nuevos módulos y señales de violación de fronteras. Es un complemento de `Module boundaries.md`.

## COLECCIONES DE FIRESTORE POR MÓDULO

Cada módulo es propietario exclusivo de sus colecciones.
Otro módulo nunca hace query directa a una colección que no le pertenece.

| Módulo | Colecciones propias | Puede leer de... |
|---|---|---|
| `hcm` | `employees`, `movements`, `compensation`, `attendance`, `incidences`, `prenomina`, `prenomina_audit`, `attendance_imports`, `employee_imports`, `departments`, `vacation_balances`, `vacation_adjustments`, `tardiness_records`, `overtime_requests`, `payroll_period_locks`, `manager_review_status`, `positions`, `locations`, `shifts`, `custom_shifts`, `holiday_calendars`, `tardiness_policy`, `early_departures`, `missing_punches`, `hourBanks`, `hourBankMovements`, `time_bank`, `shift_assignments`, `accounting_policies` | — |
| `bpmn` | `request_templates`, `requests`, `documents`, `comments`, `audit_logs` (solicitudes) | `hcm` vía `bpmn-hcm-adapter.ts` |
| `crm` | (Pendiente de implementación) | `hcm` vía `crm-hcm-adapter.ts` |
| `shared` | `users`, `notifications`, `tasks`, `roles`, `master_lists`, `integrations`, `audit_logs` (global), `holiday_calendar` | todos los módulos |

**Acceso a colecciones de `shared`:**
Las colecciones compartidas (`users`, `roles`, `tasks`, `notifications`) pueden
ser consultadas directamente por cualquier módulo usando los hooks y queries
de `src/shared/` o `src/firebase/`. No requieren adaptador.

## CHECKLIST AL CREAR UN MÓDULO NUEVO (O RETOMAR BPMN)

```
[ ] Crear carpeta en src/modules/{modulo}/
[ ] Crear README.md con responsabilidad, colecciones y dependencias declaradas
[ ] Definir {modulo}.types.ts con tipos propios — sin importar tipos de otros módulos
[ ] Si necesita datos de HCM: crear {modulo}-hcm-adapter.ts
[ ] Si necesita datos de shared: usar directamente hooks/queries de src/shared/
[ ] Añadir sección de módulo en firestore.rules con comentario de encabezado
[ ] Añadir prefijo de módulo en firestore.indexes.json para sus colecciones nuevas
[ ] Registrar colecciones propias en la tabla de esta regla (sección anterior)
[ ] Verificar que hcm/ NO importa nada del nuevo módulo
```

## SEÑALES DE VIOLACIÓN DE FRONTERAS

| Señal | Módulo afectado | Acción |
|---|---|---|
| `import` de `hcm.types.ts` dentro de `src/modules/crm/` | crm | Crear tipo propio en `crm.types.ts` |
| Query directa a `employees` desde archivo de `bpmn/` | bpmn | Mover a `bpmn-hcm-adapter.ts` |
| Lógica de BPMN dentro de `src/app/hcm/` | hcm | Mover a `src/modules/bpmn/` |
| Regla de Firestore de CRM en bloque comentado como HCM | firestore.rules | Reorganizar bajo sección CRM |
| Tipo `Employee` usado directamente en componente de CRM | crm | Definir `CRMContact` en `crm.types.ts` |
| Hook de HCM con condicional `if (module === 'crm')` | hcm | Violación de SRP — separar en módulo correspondiente |
