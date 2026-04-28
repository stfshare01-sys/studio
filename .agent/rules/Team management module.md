---
trigger: when modifying team-management page.tsx, tardiness-actions.ts, team-early-departure-actions.ts, or team-tardiness-actions.ts
---

# Rule: Contratos del Módulo Team Management

## Rol de esta regla
Documentar contratos críticos del módulo de Gestión de Equipo (`src/app/hcm/team-management/`)
que han generado bugs recurrentes. Activar esta regla cuando se modifique cualquier
archivo en ese directorio o en las actions relacionadas.

**Archivos gobernados por esta regla:**
- `src/app/hcm/team-management/page.tsx`
- `src/firebase/actions/tardiness-actions.ts`
- `src/firebase/actions/team-early-departure-actions.ts`
- `src/firebase/actions/team-tardiness-actions.ts`
- `src/firebase/actions/team-stats-actions.ts`

---

## CONTRATO 1 — Recarga de Tabs Cruzados tras Justificar Marcaje Faltante

**Función afectada:** `handleJustifyMissingPunch` en `page.tsx`

**Problema recurrente:** Al justificar un marcaje faltante con retardo o salida temprana,
`justifyMissingPunch` crea registros en `tardiness_records` y/o `early_departures`.
Si solo se recarga el tab `missing-punches`, los nuevos registros no aparecen
en sus pestañas correspondientes hasta que el usuario recarga la página.

```ts
// ❌ INCORRECTO — solo recarga un tab, los otros se quedan desactualizados
loadTabData('missing-punches');

// ✅ CORRECTO — recargar también los tabs donde se generaron nuevos registros
loadTabData('missing-punches');
if (result.generatedTardinessId)      loadTabData('tardiness');
if (result.generatedEarlyDepartureId) loadTabData('early-departures');
```

**Señal de regresión:** El usuario justifica un marcaje con hora de entrada tardía
pero no ve el retardo en la pestaña "Retardos" sin recargar la página.

---

## CONTRATO 2 — Queries de Firestore sin Índice Compuesto en `recordTardiness`

**Función afectada:** `recordTardiness` en `tardiness-actions.ts`

**Problema recurrente:** La query de historial de retardos de los últimos 30 días
para calcular `tardinessCountInPeriod` combinó en el pasado:
```
where('employeeId', '==', ...)
where('date', '>=', ...)          ← desigualdad
where('isJustified', '==', false) ← igualdad en campo diferente
```

Firestore **no permite** combinar desigualdad en `date` con igualdad en `isJustified`
sin un índice compuesto de 3 campos con el orden exacto correcto.
El error que genera es: `FirebaseError: The query requires an index.`

```ts
// ❌ PROHIBIDO — requiere índice compuesto que falla silenciosamente
const q = query(collection(db, 'tardiness_records'),
  where('employeeId', '==', id),
  where('date', '>=', startDate),
  where('isJustified', '==', false) // ← NUNCA en la misma query que el rango anterior
);

// ✅ CORRECTO — filtro isJustified en memoria (patrón establecido en el módulo)
const q = query(collection(db, 'tardiness_records'),
  where('employeeId', '==', id),
  where('date', '>=', startDate)
);
const snap = await getDocs(q);
const records = snap.docs.map(d => d.data()).filter(r => !r.isJustified); // ← en memoria
```

**Regla de oro:** Si el campo del `where` de igualdad es diferente al campo del `where`
de rango (`>=`, `<=`), mover el filtro de igualdad a memoria. NO añadir a Firestore.

---

## CONTRATO 3 — Queries de Equipos: `in` + Rango de Fecha

**Funciones afectadas:** `getTeamEarlyDepartures`, `getTeamTardiness` en sus respectivas actions

**Problema recurrente:** Combinar `where('employeeId', 'in', [...])` con
`where('date', '>=', ...)` en la misma query de Firestore requiere índice
compuesto que depende del tamaño del equipo y es impráctico de mantener.

```ts
// ❌ PROHIBIDO — combinación in + rango sin índice compuesto
const q = query(collection(db, 'early_departures'),
  where('employeeId', 'in', subordinateIds), // ← 'in'
  where('date', '>=', dateStart),            // ← rango en campo diferente
  orderBy('date')
);

// ✅ CORRECTO — patrón establecido en team-stats-actions.ts (batchQueryByEmployee)
// 1. Filtrar por rango en Firestore (campo único)
// 2. Filtrar por employeeId en memoria con Set
const q = query(collection(db, 'early_departures'),
  where('date', '>=', dateStart),
  where('date', '<=', dateEnd),
  orderBy('date', 'asc')
);
const snap = await getDocs(q);
const subordinateSet = new Set(subordinateIds);
const records = snap.docs
  .filter(d => subordinateSet.has(d.data().employeeId))
  .map(d => ({ id: d.id, ...d.data() }));
```

---

## CONTRATO 4 — Siempre mostrar pendientes independiente del filtro de fecha

**Funciones afectadas:** `getTeamEarlyDepartures`, `getTeamTardiness`

Los registros con `isJustified: false` y `justificationStatus !== 'unjustified'`
son **siempre visibles** en sus tabs, independientemente del período seleccionado.
El filtro de fecha aplica solo a los registros ya procesados.

```ts
// ⚠️ REGLA: Al aplicar filtro de fecha, ejecutar TAMBIÉN una segunda query
// que obtenga los pendientes de cualquier período y mezclarlos (deduplicando por ID).
const recordsMap = new Map<string, EarlyDeparture>();
// Query 1: filtrado por fecha
filteredSnap.docs.forEach(d => recordsMap.set(d.id, { id: d.id, ...d.data() }));
// Query 2: pendientes de todos los períodos
pendingSnap?.docs.forEach(d => {
  if (d.data().justificationStatus !== 'unjustified') {
    recordsMap.set(d.id, { id: d.id, ...d.data() }); // deduplicado automático
  }
});
```

---

## Índices requeridos en `firestore.indexes.json`

Los siguientes índices en `tardiness_records` son suficientes para todas las queries
actuales del módulo. **No añadir** `isJustified` como campo en ningún índice compuesto
con `date` — siempre filtrar en memoria:

```json
{ "collectionGroup": "tardiness_records", "fields": [
  { "fieldPath": "employeeId", "order": "ASCENDING" },
  { "fieldPath": "date", "order": "ASCENDING" }
]}
```

---

## CONTRATO 5 — Campos Opcionales en `addDoc`: Nunca `undefined`

**Función afectada:** `recordTardiness` en `tardiness-actions.ts`

**Problema recurrente:** Firestore **no acepta** campos con valor `undefined` en `addDoc`.
Asignar `campo: condición ? valor : undefined` genera:
```
FirebaseError: Function addDoc() called with invalid data.
Unsupported field value: undefined (found in field sanctionType...)
```

```ts
// ❌ PROHIBIDO — undefined en campo de Firestore
{
  sanctionType: sanctionApplied ? 'suspension_1day' : undefined, // ← Firestore lo rechaza
  sanctionDate: sanctionApplied ? now : undefined,               // ← ídem
}

// ✅ CORRECTO — spread condicional omite el campo cuando no aplica
{
  sanctionApplied,
  ...(sanctionApplied && {
    sanctionType: 'suspension_1day',
    sanctionDate: now,
  }),
}
```

**Regla de oro:** Si un campo es opcional en un documento de Firestore,
**omitirlo** cuando no aplica (spread condicional), nunca asignarlo como `undefined`.
Alternativa válida para `updateDoc`: usar `deleteField()` de `firebase/firestore`.

**Señal de detección:**
```bash
grep -n ": undefined" src/firebase/actions/
# Todo resultado dentro de un objeto que se pasa a addDoc/setDoc requiere corrección
```

---

## Checklist al modificar este módulo

```
[ ] Si añado un query de Firestore: ¿combina desigualdad (>=/<= en date)
    con igualdad en otro campo? → Si sí, mover igualdad a memoria
[ ] Si modifico handleJustifyMissingPunch: ¿estoy recargando los 3 tabs
    (missing-punches, tardiness, early-departures)?
[ ] Si añado un query con 'in' para equipos: ¿estoy filtrando solo por date
    en Firestore y por employeeId en memoria?
[ ] Si añado lógica de "siempre visible para pendientes": ¿uso el patrón
    de recordsMap con deduplicación por ID?
[ ] Si construyo payload para addDoc/setDoc: ¿algún campo puede ser undefined?
    → Usar spread condicional para omitir campos opcionales
```
