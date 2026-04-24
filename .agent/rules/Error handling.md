---
trigger: model_decision
description: Activar cuando se crea o modifica una función de Firestore, un adaptador entre módulos, una Cloud Function, o un componente que maneja estados de carga y error en la UI.
---

# Rule: Manejo de Errores Entre Módulos y Capas

## Rol de esta regla
Establecer un contrato consistente para capturar, relanzar, loguear
y comunicar errores en todas las capas del proyecto, especialmente
en los puntos de cruce entre módulos (adaptadores).

---

## PRINCIPIO CENTRAL (OBLIGATORIO)

Un error nunca desaparece en silencio.
Cada capa decide conscientemente si captura el error para manejarlo
o lo relanza para que la capa superior lo resuelva.

> Regla de oro: Un error silencioso es peor que un crash visible.
> El crash se reporta. El silencio se convierte en dato incorrecto.

---

## PARTE 1 — ERRORES EN ADAPTADORES ENTRE MÓDULOS

Los adaptadores son el punto más crítico porque cruzan la frontera
entre módulos. Un error aquí puede afectar a BPMN, CRM y HCM
de formas distintas si no está estandarizado.

### Comportamiento obligatorio en adaptadores

```ts
// src/modules/bpmn/bpmn-hcm-adapter.ts

// ❌ PROHIBIDO — error silencioso que devuelve datos vacíos sin avisar
export async function getAssigneesForBPMN(): Promise<BPMNAssignee[]> {
  try {
    const employees = await getActiveEmployees();
    return employees.map(toAssignee);
  } catch {
    return []; // ← BPMN muestra lista vacía sin saber por qué
  }
}

// ❌ PROHIBIDO — error genérico sin contexto del módulo
export async function getAssigneesForBPMN(): Promise<BPMNAssignee[]> {
  const employees = await getActiveEmployees(); // si falla, el stack trace
  return employees.map(toAssignee);             // no indica que falló en BPMN
}

// ✅ CORRECTO — error con contexto, relanzado para que BPMN lo maneje
export async function getAssigneesForBPMN(): Promise<BPMNAssignee[]> {
  try {
    const employees = await getActiveEmployees();
    return employees.map(toAssignee);
  } catch (error) {
    throw new ModuleAdapterError(
      'bpmn-hcm-adapter',
      'getAssigneesForBPMN',
      'Error al obtener empleados desde HCM para asignación de tareas',
      error
    );
  }
}
```

### Clase base para errores de adaptador

Crear en `src/shared/errors/`:

```ts
// src/shared/errors/module-adapter-error.ts
export class ModuleAdapterError extends Error {
  constructor(
    public readonly adapter: string,      // 'bpmn-hcm-adapter'
    public readonly operation: string,    // 'getAssigneesForBPMN'
    public readonly userMessage: string,  // mensaje para logs/UI
    public readonly cause?: unknown
  ) {
    super(`[${adapter}] ${operation}: ${userMessage}`);
    this.name = 'ModuleAdapterError';
  }
}
```

---

## PARTE 2 — ERRORES EN QUERIES Y MUTATIONS DE FIRESTORE

### Queries (solo lectura)

```ts
// ❌ PROHIBIDO — error sin contexto
export async function getActiveEmployees(): Promise<Employee[]> {
  const snap = await getDocs(query(collection(db, 'employees')));
  return snap.docs.map(toEmployee);
}

// ✅ CORRECTO — error con contexto de colección y operación
export async function getActiveEmployees(): Promise<Employee[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'employees'), where('status', '==', 'active'))
    );
    return snap.docs.map(toEmployee);
  } catch (error) {
    throw new FirestoreQueryError('employees', 'getActiveEmployees', error);
  }
}
```

### Mutations (escritura)

Las mutations tienen mayor riesgo porque modifican datos.
Siempre usar `runTransaction` para operaciones relacionadas
y capturar errores con contexto específico:

```ts
// ✅ CORRECTO — mutation con manejo de error explícito
export async function approveIncidence(
  incidenceId: string,
  approverId: string
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      tx.update(incidenceRef, { status: 'approved', approverId });
      tx.update(taskRef, { status: 'completed' });
    });
  } catch (error) {
    // Distinguir entre error de permisos y error de red
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new PermissionError('incidences', 'approve', approverId);
    }
    throw new FirestoreMutationError('incidences', 'approveIncidence', error);
  }
}
```

---

## PARTE 3 — ERRORES EN CLOUD FUNCTIONS

Las Cloud Functions son el único lugar donde se usa Admin SDK.
Los errores aquí nunca llegan directamente al cliente — se loguean
y se devuelve un mensaje estructurado:

```ts
// ✅ CORRECTO — Cloud Function con manejo de error estructurado
export const processAttendance = onCall(async (request) => {
  try {
    // lógica de la función
    return { success: true, processed: count };
  } catch (error) {
    // Loguear el error completo en Cloud Logging (visible en Firebase Console)
    console.error('[processAttendance] Error:', {
      userId: request.auth?.uid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Devolver error estructurado al cliente — nunca el stack trace completo
    throw new HttpsError(
      'internal',
      'Error al procesar asistencia. Por favor intenta de nuevo.'
    );
  }
});
```

**Regla:** El cliente nunca recibe el stack trace ni detalles internos.
Solo recibe un mensaje genérico accionable. El detalle va a Cloud Logging.

---

## PARTE 4 — ERRORES EN LA UI

### Cómo comunicar errores al usuario

```tsx
// ❌ PROHIBIDO — error silencioso, usuario no sabe qué pasó
async function handleApprove() {
  try {
    await approveIncidence(id, userId);
  } catch {
    // nada — el botón simplemente no hace nada
  }
}

// ❌ PROHIBIDO — error técnico expuesto al usuario
async function handleApprove() {
  try {
    await approveIncidence(id, userId);
  } catch (error) {
    alert(error.message); // "FirebaseError: [permission-denied]..."
  }
}

// ✅ CORRECTO — error comunicado con mensaje accionable
async function handleApprove() {
  try {
    await approveIncidence(id, userId);
    toast.success('Incidencia aprobada correctamente');
  } catch (error) {
    if (error instanceof PermissionError) {
      toast.error('No tienes permisos para aprobar esta incidencia');
    } else {
      toast.error('Ocurrió un error. Por favor intenta de nuevo');
    }
    // Loguear para debugging sin exponer al usuario
    console.error('[handleApprove]', error);
  }
}
```

### Estados de carga y error en componentes

```tsx
// ✅ CORRECTO — componente que maneja todos los estados
function IncidenceList() {
  const { data, isLoading, error } = useIncidences();

  if (isLoading) return <LoadingSpinner />;

  if (error) return (
    <ErrorState
      message="No se pudieron cargar las incidencias"
      onRetry={() => refetch()}  // siempre ofrecer reintentar
    />
  );

  if (!data?.length) return <EmptyState />;

  return <IncidenceTable data={data} />;
}
```

---

## PARTE 5 — CLASIFICACIÓN DE ERRORES

| Tipo de error | Dónde ocurre | Se captura | Se relanza | Se loguea |
|---|---|---|---|---|
| `FirestoreQueryError` | Queries de lectura | En adaptador con contexto | Sí — hacia UI | Solo si es inesperado |
| `FirestoreMutationError` | Writes | En mutation con contexto | Sí — hacia UI | Siempre |
| `ModuleAdapterError` | Adaptadores entre módulos | En adaptador | Sí — hacia módulo solicitante | Siempre |
| `PermissionError` | Cualquier capa | En la capa donde ocurre | Sí — con mensaje de UI | No (es esperado) |
| Error de Cloud Function | Cloud Function | En la función | No — se devuelve HttpsError | Siempre en Cloud Logging |
| Error de validación de formulario | UI | En el componente | No | No |

---

## PARTE 6 — CHECKLIST AL IMPLEMENTAR UNA FUNCIÓN NUEVA

```
[ ] ¿La función es un adaptador entre módulos?
    → Envolver en try/catch con ModuleAdapterError

[ ] ¿La función es una query de Firestore?
    → Envolver en try/catch con FirestoreQueryError

[ ] ¿La función es una mutation de Firestore con datos relacionados?
    → Usar runTransaction + catch con FirestoreMutationError

[ ] ¿La función es una Cloud Function?
    → Loguear error completo + devolver HttpsError genérico al cliente

[ ] ¿El componente consume datos de Firestore?
    → Manejar estados: isLoading / error / empty / data

[ ] ¿El componente ejecuta una acción del usuario?
    → Mostrar toast de éxito/error + opción de reintento si aplica

[ ] ¿El error puede ser de permisos?
    → Capturar FirebaseError con code 'permission-denied' por separado
    → Mensaje específico al usuario sobre falta de permisos
```

---

## NOTA: Estado actual del proyecto

Esta rule establece la base para cuando se implementen BPMN, CRM
y otros módulos futuros. En HCM ya existe manejo de errores parcial —
al refactorizar o añadir funciones nuevas, migrar gradualmente
al patrón definido aquí sin romper el comportamiento existente.

Las clases `ModuleAdapterError`, `FirestoreQueryError`,
`FirestoreMutationError` y `PermissionError` deben crearse en
`src/shared/errors/` antes de implementar el primer adaptador
entre módulos.