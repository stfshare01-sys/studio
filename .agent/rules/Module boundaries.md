---
trigger: always_on
---

# Rule: Fronteras de Módulos — Contratos Entre Dominios

## Rol de esta regla
Establecer límites explícitos entre módulos para que HCM, BPMN, CRM
y cualquier módulo futuro puedan crecer de forma independiente sin
acoplarse directamente entre sí.

---

## PRINCIPIO CENTRAL (OBLIGATORIO)

Un módulo nunca accede directamente a la lógica interna ni a las
colecciones de Firestore de otro módulo.
**Toda comunicación entre módulos ocurre a través de contratos explícitos.**

> Regla de oro: Si el módulo A necesita algo del módulo B,
> el módulo A crea un adaptador. El módulo B no se entera.

---

## POLÍTICA DE TRANSICIÓN (HCM)

> [!NOTE]
> **Estado de HCM**: El módulo HCM es el núcleo legacy del sistema. 
> - Sus archivos actuales en `src/firebase/actions/` y `src/app/hcm/` se consideran estables.
> - **NO** se requiere mover HCM a la estructura de `src/modules/hcm/` en este momento.
> - La migración de HCM ocurrirá solo cuando se requiera una refactorización mayor de su lógica interna.
> - **Nuevos Módulos**: BPMN, CRM y cualquier feature independiente **DEBEN** crearse bajo `src/modules/{modulo}/`.

---

## MAPA DE MÓDULOS DEL PROYECTO

```
src/
├── modules/
│   ├── hcm/          ← Capital Humano (activo, módulo base)
│   ├── bpmn/         ← Motor de procesos (en pausa, retomar con esta estructura)
│   └── crm/          ← Gestión de clientes (futuro)
├── shared/           ← Lo que todos los módulos pueden usar libremente
│   ├── components/   ← UI genérica sin lógica de negocio
│   ├── hooks/        ← Hooks de infraestructura (auth, permissions, firebase)
│   ├── lib/          ← Utilidades puras sin dependencia de módulo
│   └── types/        ← Tipos compartidos (common.types.ts, auth.types.ts)
└── firebase/
    ├── actions/      ← Queries y mutations organizados por dominio
    └── provider.tsx  ← Contexto global de Firebase
```

---

## REGLAS DE DEPENDENCIA ENTRE MÓDULOS

### Dirección permitida de dependencias

```
shared/  ←── hcm/
shared/  ←── bpmn/
shared/  ←── crm/

hcm/     ←── bpmn/   (solo vía adaptador en bpmn/)
hcm/     ←── crm/    (solo vía adaptador en crm/)

bpmn/    ✗── crm/    (PROHIBIDO — comunicación directa entre módulos laterales)
crm/     ✗── bpmn/   (PROHIBIDO — ídem)
hcm/     ✗── bpmn/   (PROHIBIDO — HCM no conoce a BPMN ni a CRM)
hcm/     ✗── crm/    (PROHIBIDO — ídem)
```

**Resumen:** Las dependencias solo fluyen hacia `shared/` o hacia `hcm/`
desde los módulos que lo necesiten. Nunca en sentido inverso. Nunca lateral.

---

## ESTRUCTURA INTERNA DE CADA MÓDULO

Cada módulo sigue la misma estructura interna para consistencia:

```
src/modules/{modulo}/
├── {modulo}-queries.ts       → Reads de Firestore propios del módulo
├── {modulo}-mutations.ts     → Writes de Firestore propios del módulo
├── {modulo}-utils.ts         → Lógica de negocio pura del módulo
├── {modulo}.types.ts         → Tipos internos del módulo
├── {modulo}-adapter.ts       → (Opcional) Adaptador para consumir datos de otro módulo
└── README.md                 → Descripción, colecciones que usa, dependencias externas
```

**Ejemplo para BPMN cuando retome desarrollo:**
```
src/modules/bpmn/
├── bpmn-queries.ts
├── bpmn-mutations.ts
├── bpmn-utils.ts
├── bpmn.types.ts
├── bpmn-hcm-adapter.ts      ← BPMN accede a empleados de HCM solo desde aquí
└── README.md
```

---

## CONTRATOS ENTRE MÓDULOS — CÓMO IMPLEMENTARLOS

### Patrón: Adaptador de módulo

El adaptador es el único archivo que puede cruzar la frontera entre módulos.
Vive en el módulo que necesita los datos, no en el módulo que los provee.

```ts
// src/modules/bpmn/bpmn-hcm-adapter.ts
// CONTRATO: BPMN necesita datos básicos de empleados para asignar tareas de proceso.
// ACCESO: Solo lectura. No modifica datos de HCM.
// FUENTE: employee-queries.ts (HCM)
// TIPO PROPIO: BPMNAssignee (no expone Employee de HCM al resto de BPMN)

import { getActiveEmployees } from '@/firebase/actions/employee-queries';
import type { Employee } from '@/types/hcm.types';
import type { BPMNAssignee } from './bpmn.types';

/**
 * Obtiene la lista de empleados activos en el formato que BPMN necesita
 * para asignar responsables a tareas de proceso.
 * No expone datos sensibles de HCM (compensación, incidencias).
 */
export async function getAssigneesForBPMN(): Promise<BPMNAssignee[]> {
  const employees = await getActiveEmployees();
  return employees.map((emp: Employee): BPMNAssignee => ({
    uid: emp.id,
    displayName: `${emp.firstName} ${emp.lastName}`,
    department: emp.department,
    // Solo los campos que BPMN realmente necesita
  }));
}
```

### Patrón: Tipo propio por módulo

Cada módulo define sus propios tipos para los datos que consume de otros módulos.
Nunca importa el tipo original del módulo fuente directamente en componentes.

```ts
// ❌ PROHIBIDO — BPMN usando tipos internos de HCM en su UI
// src/modules/bpmn/BPMNTaskAssigner.tsx
import type { Employee } from '@/types/hcm.types';  // ← acoplamiento de tipos

// ✅ CORRECTO — BPMN usa su propio tipo derivado
// src/modules/bpmn/bpmn.types.ts
export interface BPMNAssignee {
  uid: string;
  displayName: string;
  department: string;
}
// src/modules/bpmn/BPMNTaskAssigner.tsx
import type { BPMNAssignee } from './bpmn.types';  // ← sin acoplamiento
```

---

## COLECCIONES DE FIRESTORE POR MÓDULO

> Mapa completo de colecciones por módulo y políticas de acceso → ver [Module boundaries-reference.md](./Module boundaries-reference.md)

---

## FIRESTORE RULES — SEPARACIÓN POR MÓDULO

Dado que `firestore.rules` es un archivo monolítico (890 líneas actualmente),
organizar las reglas con comentarios de sección explícitos para cada módulo.
Al añadir reglas para BPMN o CRM, seguir este patrón:

```
// ============================================================
// MÓDULO: BPMN
// Colecciones: processes, process_instances, bpmn_tasks
// Acceso cruzado: Lee employees (HCM) — solo lectura básica
// Última modificación: [fecha] — [motivo]
// ============================================================

match /processes/{processId} {
  allow read: if isSignedIn() && hasModule('bpmn_viewer');
  allow write: if isSignedIn() && hasModule('bpmn_admin');
}
```

**Reglas para accesos cruzados entre módulos:**
```
// ACCESO CRUZADO: BPMN → HCM
// BPMN necesita leer employees para asignar responsables de tareas.
// Permiso restringido: solo campos no sensibles vía función de validación.
// NO permite acceso a compensation, incidences ni vacation_balances.
match /employees/{employeeId} {
  allow read: if isSignedIn()
    && (hasModule('hcm_employees') || hasModule('bpmn_viewer'));
}
```

---

## FIRESTORE INDEXES — PREFIJO POR MÓDULO

Al añadir índices compuestos en `firestore.indexes.json`, usar el comentario
de sección correspondiente para mantener la organización cuando el archivo escale:

```json
{
  "indexes": [
    // --- HCM: attendance ---
    {
      "collectionGroup": "attendance",
      "queryScope": "COLLECTION",
      "fields": [...]
    },
    // --- BPMN: process_instances ---
    {
      "collectionGroup": "process_instances",
      "queryScope": "COLLECTION",
      "fields": [...]
    }
  ]
}
```

**Naming de índices por módulo:** Si Firebase permite etiquetas,
usar prefijo `hcm_`, `bpmn_`, `crm_` en los nombres de `collectionGroup`
para nuevas colecciones de módulos que aún no existen.

---

## README OBLIGATORIO POR MÓDULO

Cada módulo debe tener un `README.md` en su carpeta raíz.
Este archivo es lo primero que el agente debe leer antes de trabajar en el módulo.

```markdown
# Módulo: [Nombre]

## Responsabilidad
Una sola oración: qué problema de negocio resuelve este módulo.

## Colecciones de Firestore
- `nombre_coleccion` — descripción del contenido

## Dependencias externas
- **HCM** — vía `[modulo]-hcm-adapter.ts` — [qué datos consume y por qué]

## Lo que este módulo NO hace
- [exclusiones explícitas para evitar que se le asignen responsabilidades ajenas]

## Archivos clave
- `[modulo]-queries.ts` — [qué queries contiene]
- `[modulo]-mutations.ts` — [qué operaciones de escritura contiene]
- `[modulo]-adapter.ts` — [qué módulo externo consume y qué transforma]

## Estado actual
- [ ] En desarrollo activo
- [ ] En pausa (documentar fecha y motivo)
- [ ] En producción
```

---

## CHECKLIST AL CREAR UN MÓDULO NUEVO (O RETOMAR BPMN)

> Ver checklist paso a paso en [Module boundaries-reference.md](./Module boundaries-reference.md)

---

## SEÑALES DE VIOLACIÓN DE FRONTERAS

> Ver tabla de señales de alerta de acoplamiento en [Module boundaries-reference.md](./Module boundaries-reference.md)