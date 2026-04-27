---
description: Modo Analista de Refactorización — Cirugía de código sin regresiones para el stack Next.js 15 + Firebase + Genkit.
---

# Firebase Coding Standards & Refactoring

## 1. Estándares JS/TS (Obligatorio)

### Sintaxis base
- `const` por defecto. `let` solo si se reasigna. `var` **PROHIBIDO**.
- `async/await` + `try/catch` siempre. Cero callbacks anidados.
- ES2025+: Optional Chaining `?.`, Nullish Coalescing `??`, Arrow functions.
- Tipado estricto: interfaces/types para **todos** los documentos Firestore.

### Firebase SDK
```ts
// ✅ CORRECTO — SDK Modular
import { getAuth } from 'firebase/auth';
import { collection, query, serverTimestamp } from 'firebase/firestore';

// ❌ PROHIBIDO — Namespace API (deprecated)
firebase.auth();
firebase.firestore();
```

### Timestamps en Firestore
```ts
// ✅ CORRECTO
await addDoc(collection(db, 'employees'), { createdAt: serverTimestamp() });

// ❌ PROHIBIDO — nunca en escrituras del cliente
{ createdAt: new Date().toISOString() }
```

### Writes relacionados
```ts
// ✅ CORRECTO — operación atómica
await runTransaction(db, async (tx) => {
  tx.update(docRefA, { status: 'closed' });
  tx.update(docRefB, { linkedId: id });
});

// ❌ PROHIBIDO — race condition potencial
await updateDoc(docRefA, { status: 'closed' });
await updateDoc(docRefB, { linkedId: id });
```

---

## 2. Arquitectura y Separación de Archivos

### Regla crítica: NO mezclar
- `'use client'` + imports de Admin SDK → **separar inmediatamente**
- Lógica de DB + lógica de UI en el mismo archivo → **separar**
- Barrel files (`index.ts` re-exportando todo) en carpetas con Cloud Functions → **eliminar** (rompen tree shaking, aumentan cold starts)

### Estructura de features
```
feature/
├── feature-queries.ts      → Solo reads/queries (getDocs, onSnapshot)
├── feature-mutations.ts    → Solo writes (addDoc, updateDoc, runTransaction)
└── feature-utils.ts        → Funciones puras sin side effects
```

### Separación de types
```
src/types/
├── hcm.types.ts            → Empleados, asistencia, incidencias
├── workflow.types.ts       → Motor BPMN/Workflow
├── auth.types.ts           → Usuario, roles, permisos
└── common.types.ts         → Tipos compartidos entre módulos
```

### Límites de tamaño (SRP aplicado a archivos)
| Tipo de archivo | Umbral advertencia | Umbral crítico |
|---|---|---|
| Actions / mutations | > 300 líneas | > 400 → **evaluar segmentación** |
| `types.ts` | > 150 líneas | > 200 → **separar por dominio** |
| Componente React | > 200 líneas | > 250 → **extraer sub-componentes** |
| Hook | > 80 líneas | > 100 → **separar datos de UI** |

### Excepción: Acoplamiento funcional legítimo

El límite de líneas es un **indicador**, no una ley. No segmentar si el archivo cumple **todas** estas condiciones:

- Las funciones comparten estado o lógica que no puede duplicarse sin crear inconsistencias
- Fragmentar requeriría pasar 3+ parámetros entre módulos que hoy son internos al archivo
- El riesgo de regresión al refactorizar supera el beneficio de la separación física

**Ejemplo válido:** `tardiness-actions.ts` con retardos, salidas tempranas y marcajes faltantes que comparten lógica de `hour-bank` y `task-completion` — fragmentarlo crearía más acoplamiento del que resuelve.

**Acción alternativa:** Documentar el acoplamiento al inicio del archivo:
```ts
// ARQUITECTURA: Este archivo supera el umbral de 400 líneas intencionalmente.
// Motivo: Las funciones de retardos, salidas tempranas y marcajes faltantes
//         comparten estado de hour-bank y task-completion. Fragmentar generaría
//         acoplamiento entre módulos mayor al problema que resuelve.
// Revisión: Reconsiderar si se desacopla la lógica de hour-bank en su propio servicio.
```

**Cuándo sí segmentar a pesar del acoplamiento:**
- Hay funciones que claramente NO comparten estado con el resto del archivo
- El archivo mezcla queries de solo lectura con mutations — esas sí se pueden separar sin riesgo

---

## 3. Nomenclatura de Archivos
| Tipo | Convención | Ejemplo |
|---|---|---|
| Firebase actions (reads) | `{dominio}-queries.ts` | `employee-queries.ts` |
| Firebase actions (writes) | `{dominio}-mutations.ts` | `attendance-mutations.ts` |
| Componente React | `PascalCase.tsx` | `EmployeeCard.tsx` |
| Hook | `use-{nombre}.ts` | `use-permissions.ts` |
| Types | `{dominio}.types.ts` | `hcm.types.ts` |
| Utils puros | `{dominio}-utils.ts` | `attendance-utils.ts` |

---

## 4. Permisos (Checklist Obligatorio)

### NUNCA hardcodear roles
```tsx
// ❌ PROHIBIDO — ignora customizaciones del admin
const canCreate = user?.role === 'Admin' || user?.role === 'HRManager';

// ✅ CORRECTO — usa el sistema dinámico
import { usePermissions } from '@/hooks/use-permissions';
const { canRead, canWrite, isAdmin } = usePermissions();
const canCreate = isAdmin || canWrite('hcm_employees');
```

### Queries a colecciones protegidas
```tsx
// ✅ CORRECTO — retorna null si no hay permiso (evita "Missing or insufficient permissions")
const employeesQuery = useMemoFirebase(() => {
  if (!firestore || !canRead('hcm_employees')) return null;
  return query(collection(firestore, 'employees'), where('status', '==', 'active'));
}, [firestore, canRead]);
```

### Colecciones protegidas → AppModule
| Módulo | Colecciones Firestore |
|---|---|
| `hcm_employees` | `employees` |
| `hcm_attendance` | `attendance`, `missing_punches` |
| `hcm_incidences` | `incidences`, `vacation_balances` |
| `hcm_prenomina` | `prenomina_periods` |
| `hcm_team_hour_bank` | `hour_bank` |
| `hcm_admin_*` | `shifts`, `positions`, `locations`, `departments` |

### Flujo de resolución de permisos (`getUserPermissions`)
```
1. ¿Tiene customRoleId?     → Buscar en /roles/{customRoleId}
2. ¿Es rol sistema?         → Buscar override en /roles/{role.toLowerCase()}
3. ¿Tiene override?         → Usar esos permisos
4. ¿No tiene override?      → Usar defaults de SYSTEM_ROLES
5. ¿Sin match?              → Caer a SYSTEM_ROLES.Member
```

### Funciones con `list` sobre colecciones protegidas (`hasDirectReports`)
Funciones que hacen `list` sobre `employees` deben protegerse con el sistema de permisos, **nunca** comparando rol directamente:
```tsx
// ❌ PROHIBIDO
useEffect(() => {
  const canCheck = ['Manager', 'HRManager', 'Admin'].includes(user?.role);
  if (user?.uid && canCheck) hasDirectReports(user.uid).then(setIsManager);
}, [user]);

// ✅ CORRECTO
const { canRead } = usePermissions();
useEffect(() => {
  if (user?.uid && canRead('hcm_employees'))
    hasDirectReports(user.uid).then(setIsManager);
}, [user, canRead]);
```

### Nuevo tipo de Task → actualizar `firestore.rules`
Al crear un nuevo tipo de task, es **obligatorio** agregarlo al array en las reglas o el SDK lo rechazará en runtime:
```
allow create: if isSignedIn()
  && request.auth.uid == request.resource.data.requestOwnerId
  && request.resource.data.type in [
    'incidence_approval', 'justification', 'tardiness_review',
    'departure_review', 'overtime_review', 'NUEVO_TIPO_AQUI'
  ];
```

### Nuevo módulo en sidebar
Al agregar ítem a `ALL_NAV_ITEMS`:
1. Definir `module: AppModule` para el ítem
2. Agregar permisos default en `SYSTEM_ROLES` de `role-actions.ts` para **todos** los roles
3. El sidebar filtrará automáticamente vía `canRead(item.module)`

---

## 5. Principios SOLID aplicados

### OCP (Abierto/Cerrado)
- Añadir funcionalidad nueva → **código nuevo**, no modificar el núcleo que funciona
- Usa abstracciones (interfaces, hooks genéricos, componentes base) para crecer sin alterar lo existente

### SRP (Responsabilidad Única)
- Un archivo, componente o función = **una sola razón para cambiar**
- Si cambias lógica de UI → la lógica de datos no debe verse afectada, y viceversa
- Cero "God objects" o funciones de configuración masivas

### Cero parches rápidos
- No aceptar `if (bug) fix()` — buscar siempre la causa raíz
- Mejorar la estructura interna sin cambiar el comportamiento externo antes de añadir lógica encima

### Red de seguridad: CI y pruebas
- Ninguna refactorización está completa sin pasar el flujo de CI: **Linting → Type-check → Build**
- Nunca ignorar errores de compilación o linter — resolverlos antes del merge
- Si no existen pruebas unitarias para el módulo afectado, **probar manualmente de forma exhaustiva** las áreas colaterales al cambio
- Si una corrección rompe comportamiento existente, el fallo debe detectarse **antes** de llegar a producción

---

## 6. Modo Análisis de Refactorización

Al corregir bugs o refactorizar, seguir este proceso:

### Paso 1 — Análisis de impacto
Antes de proponer cualquier cambio, identificar:
- ¿Quién importa la función afectada? (`grep -r "functionName" src/`)
- ¿Qué forma tienen los datos que devuelve?
- ¿Hay componentes cliente **y** server actions que la consumen?

> [!TIP]
> Para cambios profundos o creación de nuevas funcionalidades, se debe invocar el workflow `/add-feature`, el cual contiene un Análisis de Impacto y Riesgo mucho más exhaustivo.

### Paso 2 — Estructura de respuesta
1. **Causa raíz:** Por qué ocurrió el problema estructural o el bug
2. **Dos opciones:**
   - **Rápida:** Fix mínimo viable — indicar riesgos y deuda técnica que genera
   - **Estructural:** Refactorización limpia — indicar esfuerzo estimado
3. **Prueba de regresión:** Escenario (no necesariamente código formal) que demuestre que el bug desapareció y las funciones colaterales siguen operando

### Paso 3 — Señales de deuda a reportar siempre
| Señal | Umbral | Acción |
|---|---|---|
| Archivo de acciones muy grande | > 400 líneas | Evaluar: ¿acoplamiento legítimo? → documentar. ¿Responsabilidades mezcladas? → segmentar |
| `types.ts` monolítico | > 200 líneas | Separar por dominio |
| Timestamps manuales en Firestore | Cualquier `new Date()` en escritura | Migrar a `serverTimestamp()` |
| Race condition potencial | Múltiples writes sin `runTransaction` | Envolver en transacción |
| Hook con lógica mixta | UI + datos en mismo hook | Separar en hook de datos + hook de UI |
| `'use client'` + Admin SDK | Cualquier caso | Separar inmediatamente |
| Rol hardcodeado | `user.role === 'X'` directo | Migrar a `usePermissions()` |

---

## 7. Checklist Previo a Proponer un Cambio

> [!TIP]
> Este es un checklist de referencia rápida. Para cambios complejos o features
> nuevas, el estándar es seguir el flujo detallado en `.agents/workflows/Add feature.md`.

```
[ ] ¿Modifica la firma de una función exportada?
    → Revisar TODOS los archivos que la importan

[ ] ¿Toca un Server Action?
    → Verificar que los componentes cliente siguen siendo compatibles

[ ] ¿Toca Firestore Rules?
    → Probar: usuario no autenticado / rol Member / rol Admin

[ ] ¿Toca un componente compartido (src/components/ui)?
    → Revisar todos los lugares donde se usa

[ ] ¿El cambio lleva un archivo de actions más allá de 400 líneas?
    → Segmentar ahora, no después

[ ] ¿Hay writes relacionados sin runTransaction?
    → Envolver antes de hacer el merge

[ ] ¿Se está comparando user.role directamente?
    → Migrar a usePermissions() antes de avanzar
```
