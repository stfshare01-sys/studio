---
trigger: always_on
---

# Rule: No Modificar la Fuente — Usar Adaptadores

## Rol de esta regla
Prevenir el efecto dominó causado por modificar lógica existente y estable
para satisfacer los requisitos de una función nueva.

---

## PRINCIPIO CENTRAL (OBLIGATORIO)

Cuando una función nueva necesita algo que ya existe en el código,
**NUNCA modifiques la implementación original.**
Crea un adaptador, wrapper o extensión que traduzca lo que necesitas.

> Regla de oro: Si está funcionando, no lo toques.
> Si lo tienes que tocar, algo en el diseño de la función nueva está mal.

---

## CUÁNDO APLICA ESTA REGLA

Esta regla se activa en cualquiera de estos escenarios:

- La nueva función necesita que una función existente **devuelva datos en otro formato**
- La nueva función necesita **añadir un parámetro opcional** a una función existente
- La nueva función necesita **comportamiento ligeramente distinto** de una lógica ya probada
- Un módulo nuevo (BPMN, CRM) necesita **consumir datos de HCM**
- Necesitas reutilizar un componente UI pero con **variantes visuales o de comportamiento**

---

## QUÉ HACER EN CADA CASO

### Caso 1 — La función existente devuelve datos en formato incorrecto

```ts
// ❌ PROHIBIDO — modificar la fuente para que devuelva lo que necesita el nuevo módulo
// employee-queries.ts (archivo estable de HCM)
export async function getActiveEmployees() {
  // ANTES devolvía Employee[]
  // MODIFICADO para devolver { id, fullName } porque CRM lo necesita así  ← ROMPE HCM
}

// ✅ CORRECTO — crear un adaptador en el módulo que lo necesita
// src/modules/crm/crm-employee-adapter.ts
import { getActiveEmployees } from '@/firebase/actions/employee-queries';
import type { Employee } from '@/types/hcm.types';
import type { CRMContact } from '@/types/crm.types';

export async function getEmployeesAsCRMContacts(): Promise<CRMContact[]> {
  const employees = await getActiveEmployees(); // fuente intacta
  return employees.map((emp: Employee) => ({
    id: emp.id,
    fullName: `${emp.firstName} ${emp.lastName}`,
    // transformación solo en este archivo, nunca en la fuente
  }));
}
```

### Caso 2 — Necesitas añadir un parámetro opcional a una función existente

```ts
// ❌ PROHIBIDO — añadir parámetro a función estable
export async function getAttendanceByEmployee(
  employeeId: string,
  includeDeleted?: boolean  // ← parámetro nuevo que rompe el contrato actual
) { ... }

// ✅ CORRECTO — nueva función que extiende el comportamiento
// attendance-queries.ts (nuevo bloque, mismo archivo si es el mismo dominio)
export async function getAttendanceWithDeletedByEmployee(
  employeeId: string
): Promise<Attendance[]> {
  // lógica nueva, fuente original intacta
}
```

### Caso 3 — Un módulo nuevo necesita datos de HCM

```ts
// ❌ PROHIBIDO — módulo CRM importando directamente de colecciones de HCM
// src/modules/crm/crm-service.ts
import { collection, getDocs } from 'firebase/firestore';
const snap = await getDocs(collection(db, 'employees')); // ← acceso directo sin contrato

// ✅ CORRECTO — contrato explícito vía adaptador de módulo
// src/modules/crm/crm-employee-adapter.ts  ← único punto de entrada a datos de HCM
// src/modules/bpmn/bpmn-employee-adapter.ts ← ídem para BPMN
```

### Caso 4 — Componente UI necesita variante

```tsx
// ❌ PROHIBIDO — añadir props condicionales al componente original
// EmployeeCard.tsx
export function EmployeeCard({ employee, showCRMFields }: Props) {
  // if showCRMFields → renderiza cosas de CRM dentro de un componente de HCM
}

// ✅ CORRECTO — composición o componente extendido
// src/modules/crm/CRMEmployeeCard.tsx
import { EmployeeCard } from '@/components/EmployeeCard';
export function CRMEmployeeCard({ employee, crmData }: Props) {
  return (
    <>
      <EmployeeCard employee={employee} /> {/* componente original intacto */}
      <CRMSection data={crmData} />        {/* extensión en módulo nuevo */}
    </>
  );
}
```

---

## ÁRBOL DE DECISIÓN — Antes de modificar cualquier archivo

```
¿Necesito cambiar comportamiento de código existente?
│
├── ¿El cambio es un bugfix de la lógica original?
│   └── SÍ → Modificar está permitido.
│           Ejecutar Paso 1 del Modo Análisis (grep de importadores).
│
├── ¿El cambio es para satisfacer una función NUEVA?
│   └── SÍ → STOP. Crear adaptador en el módulo nuevo.
│           Nunca modificar la fuente.
│
└── ¿No estoy seguro si es bug o requerimiento nuevo?
    └── Reportarlo explícitamente antes de escribir código.
        Formato: "Esto parece X, ¿confirmas que es un bug
        y no un requerimiento nuevo del módulo Y?"
```

---

## SEÑALES DE ALERTA — Detener y reportar si se detecta esto

Antes de proponer cualquier cambio, revisar esta lista. Si alguna aplica, reportar
**antes de escribir código**:

| Señal | Riesgo | Acción |
|---|---|---|
| Modificar una función que importan 3+ archivos | Alto — efecto dominó | Crear adaptador obligatoriamente |
| Añadir parámetro opcional a función exportada | Medio — rompe contrato silenciosamente | Nueva función con nombre descriptivo |
| Cambiar el tipo de retorno de una función | Crítico — rompe TypeScript en cascada | Nunca. Nueva función siempre |
| Módulo nuevo importando colecciones de otro módulo directamente | Alto — acoplamiento duro | Crear adaptador en módulo solicitante |
| Añadir lógica de CRM/BPMN dentro de archivos de `hcm/` | Crítico — contaminación de dominio | Separar en módulo correspondiente |

---

## ESTRUCTURA DE ARCHIVOS DE ADAPTADORES

```
src/
├── modules/
│   ├── crm/
│   │   ├── crm-employee-adapter.ts   ← único acceso a datos de HCM desde CRM
│   │   ├── crm-queries.ts
│   │   └── crm-mutations.ts
│   ├── bpmn/
│   │   ├── bpmn-employee-adapter.ts  ← único acceso a datos de HCM desde BPMN
│   │   └── bpmn-process-mutations.ts
│   └── hcm/                          ← HCM no importa de CRM ni BPMN. Nunca.
│       ├── employee-queries.ts
│       └── attendance-mutations.ts
```

**Regla de dependencias entre módulos:**
- HCM no importa de CRM ni BPMN
- CRM puede importar de HCM solo vía adaptador
- BPMN puede importar de HCM solo vía adaptador
- CRM y BPMN no se importan entre sí directamente

---

## NOTA SOBRE FIRESTORE RULES Y INDEXES

Al crear un adaptador para un módulo nuevo que accede a colecciones de otro módulo:
1. **No reutilizar las reglas del módulo origen** — crear regla específica para el caso de uso
2. **Documentar el acceso cruzado** en el comentario de la regla:
   ```
   // ACCESO CRUZADO: CRM lee employees solo para mostrar contactos internos.
   // Permiso de solo lectura, sin acceso a compensation ni datos sensibles.
   allow read: if isSignedIn() && hasModule('crm_contacts');
   ```