---
trigger: always_on
---

# Firebase Scale — Comportamiento Crítico de Firestore

## Archivo complementario de `firebase-scale.md`
Cubre tres comportamientos de Firestore que generan errores silenciosos
y difíciles de rastrear si no se conocen de antemano.

---

## 1. Fechas y Zonas Horarias (Timezone Dates)

```ts
// ❌ PROHIBIDO — genera desfase de -1 día en Guadalajara (UTC-6)
{ fecha: new Date().toISOString() }       // "2024-01-15T06:00:00.000Z"
{ fecha: fechaDate.toISOString() }        // convierte a UTC, pierde el día local

// ✅ CORRECTO — conserva la fecha exacta sin conversión de zona horaria
{ fecha: fechaDate.toISOString().split('T')[0] }  // "2024-01-15"
{ fecha: '2024-01-15' }                           // string directo si ya es YYYY-MM-DD
```

**Regla:** Al guardar fechas tipo `YYYY-MM-DD` en Firestore, nunca usar
`.toISOString()` completo. Usar siempre `.split('T')[0]` o almacenar
directamente el string de fecha sin conversión a UTC.

**Por qué afecta a este proyecto:** Guadalajara es UTC-6. Una fecha
guardada con `.toISOString()` completo a las 11pm local se convierte
a la madrugada del día siguiente en UTC — los reportes de asistencia
y prenómina muestran un día menos del real.

**Señal de detección en auditoría:**
```bash
# Buscar usos de toISOString() sin .split('T')[0]
grep -rn "toISOString()" src/ --include="*.ts" --include="*.tsx" | grep -v "split"
```

---

## 2. Additividad de Reglas de Seguridad

```
// ❌ TRAMPA — allow write incluye create, update Y delete
// Esta combinación NO funciona como se espera:
allow write: if isSignedIn();
allow delete: if false;  // ← NO cancela el allow write anterior

// ✅ CORRECTO — declarar permisos granulares explícitamente
allow create: if isSignedIn() && hasModule('hcm_employees');
allow update: if isSignedIn() && hasModule('hcm_employees');
allow delete: if false;  // ahora sí funciona — no hay allow write genérico
```

**Regla:** Las reglas de Firestore son **aditivas** — si cualquier
`allow` coincide, la operación se permite. Nunca usar `allow write`
si después se quiere restringir `delete`. Siempre declarar `create`,
`update` y `delete` por separado en colecciones que requieran control
granular.

**Colecciones críticas que requieren control granular:**
`vacation_balances`, `compensation`, `prenomina_periods` — solo
escritura desde Cloud Functions (Admin SDK), nunca desde cliente.

**Señal de detección en auditoría:**
```bash
# Buscar allow write genérico en firestore.rules
grep -n "allow write" firestore.rules
# Resultado esperado: cero — todas las reglas deben ser granulares
```

---

## 3. Campos Anidados No Indexados (Maps)

```ts
// ❌ PROBLEMA — Firestore NO indexa automáticamente campos en Maps
interface AttendanceRecord {
  metadata: {
    incidenceId: string;  // ← NO es queryable directamente
    source: string;
  }
}

// Query que FALLARÁ en producción:
query(collection(db, 'attendance'),
  where('metadata.incidenceId', '==', id)  // ← campo anidado sin índice
);

// ✅ CORRECTO — campos de nivel superior para queries
interface AttendanceRecord {
  incidenceId: string;  // nivel superior → indexado automáticamente
  metadata: {           // Maps solo para datos que no se consultan
    source: string;
  }
}
```

**Regla:** Si un campo va a usarse en `where()`, `orderBy()` u otras
queries de Firestore, debe estar en el nivel superior del documento,
no dentro de un Map. Los campos dentro de Maps requieren índices
explícitos en `firestore.indexes.json` y aun así tienen limitaciones.

**Señal de detección en auditoría:**
```bash
# Buscar campos anidados usados en queries
grep -rn "where('" src/ --include="*.ts" | grep "\."
# Cualquier resultado con formato "objeto.campo" requiere revisión
```

---

## Resumen rápido de los tres comportamientos

| Comportamiento | Error silencioso que genera | Solución |
|---|---|---|
| `.toISOString()` completo | Fechas con -1 día en reportes | `.split('T')[0]` siempre |
| `allow write` genérico | Delete permitido aunque se diga `if false` | Declarar `create/update/delete` por separado |
| Campos en Maps para queries | Query falla en producción sin error claro | Subir campo al nivel superior del documento |