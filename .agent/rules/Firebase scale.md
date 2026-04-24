---
trigger: always_on
---

# Rule: Escalado de Firebase — Rules, Indexes y Seguridad por Módulo

## Rol de esta regla
Establecer la estrategia para mantener `firestore.rules` y
`firestore.indexes.json` organizados, auditables y sin riesgo de
regresión conforme el proyecto crece con nuevos módulos.

---

## CONTEXTO ACTUAL DEL PROYECTO

| Archivo | Líneas actuales | Estado |
|---|---|---|
| `firestore.rules` | ~890 líneas | Monolítico pero bien comentado por sección |
| `firestore.indexes.json` | ~754 líneas | Un solo archivo, agrupado por `collectionGroup` |

Ambos archivos son funcionales hoy. El riesgo no es el presente,
es que al añadir BPMN y CRM sin estructura, estos archivos se vuelven
inauditables y cualquier cambio puede afectar reglas de otro módulo.

---

## PRINCIPIO CENTRAL (OBLIGATORIO)

Ninguna regla de seguridad ni índice nuevo se añade sin identificar
explícitamente a qué módulo pertenece y qué colección afecta.

> Regla de oro: Una regla de Firestore mal ubicada o sin módulo
> identificado es deuda de seguridad, no solo deuda técnica.

---

## PARTE 1 — FIRESTORE SECURITY RULES

### Estructura de secciones obligatoria

El archivo `firestore.rules` debe seguir este orden de secciones.
No añadir reglas fuera de la sección correspondiente a su módulo:

```
firestore.rules
│
├── 1. Helper Functions (globales)
│   └── isSignedIn(), hasRole(), hasModule(), isHRManager(), etc.
│
├── 2. Protección Global
│   └── Bloqueo de /secrets/, deny-all por defecto
│
├── 3. Shared — Colecciones compartidas
│   └── users/, notifications/, tasks/, roles/
│
├── 4. Módulo HCM
│   └── employees/, attendance/, incidences/, prenomina/,
│       vacation_balances/, hour_bank/, missing_punches/,
│       shifts/, positions/, locations/, departments/, compensation/
│
├── 5. Módulo BPMN  ← añadir cuando se retome
│   └── processes/, process_instances/, bpmn_tasks/
│
├── 6. Módulo CRM   ← añadir cuando se desarrolle
│   └── contacts/, opportunities/, crm_activities/
│
└── 7. Accesos Cruzados entre Módulos
    └── Reglas donde un módulo lee colecciones de otro
```

### Encabezado obligatorio por sección de módulo

Cada sección de módulo debe comenzar con este bloque de comentario:

```
// ============================================================
// MÓDULO: [NOMBRE EN MAYÚSCULAS]
// Colecciones: [lista separada por comas]
// Permisos base: [quién puede leer / quién puede escribir]
// Accesos cruzados: [qué otros módulos leen estas colecciones]
// Última modificación: [fecha] — [motivo del cambio]
// ============================================================
```

### Encabezado para accesos cruzados

```
// ------------------------------------------------------------
// ACCESO CRUZADO: [MÓDULO ORIGEN] → [MÓDULO DESTINO]
// Motivo: [por qué este módulo necesita leer la colección ajena]
// Restricción: Solo [campos o condiciones permitidas]
// Revisión requerida si: [condición que invalidaría este acceso]
// ------------------------------------------------------------
```

### Regla para añadir nuevos tipos de documento en `tasks`

La colección `tasks` es compartida. Al crear un nuevo tipo de tarea
(desde cualquier módulo), es OBLIGATORIO añadirlo al array de tipos
permitidos o el SDK lo rechazará en runtime sin error descriptivo:

```
allow create: if isSignedIn()
  && request.auth.uid == request.resource.data.requestOwnerId
  && request.resource.data.type in [
    'incidence_approval',
    'justification',
    'tardiness_review',
    'departure_review',
    'overtime_review',
    // Al añadir tipo nuevo → agregarlo aquí Y en el checklist de módulo
    'NUEVO_TIPO_MODULO_BPMN',
    'NUEVO_TIPO_MODULO_CRM'
  ];
```

### Checklist antes de modificar firestore.rules

```
[ ] Identifiqué a qué módulo pertenece la regla que voy a añadir o cambiar
[ ] Ubiqué el cursor dentro de la sección correcta del módulo
[ ] Si es acceso cruzado: añadí el comentario de encabezado de acceso cruzado
[ ] Si es tipo nuevo en tasks: lo añadí al array de tipos permitidos
[ ] Probé el cambio con tres perfiles: no autenticado / rol Member / rol Admin
[ ] No modifiqué helper functions globales para resolver un caso específico de módulo
    (si necesito lógica específica, crear helper local en la sección del módulo)
[ ] Verifiqué que la sección de otros módulos no fue afectada por el cambio
```

### Señales de alerta en firestore.rules

| Señal | Riesgo | Acción |
|---|---|---|
| Regla de módulo B dentro de la sección de módulo A | Contaminación de sección | Mover a sección correcta |
| Helper function global modificada para un caso específico | Rompe otros módulos que la usan | Crear helper local en sección del módulo |
| Acceso cruzado sin comentario de encabezado | Invisible en auditoría | Añadir comentario antes del merge |
| Regla `allow read: if true` o `allow write: if true` | Brecha de seguridad crítica | Bloquear inmediatamente |
| `match /{document=**}` sin restrict | Expone todo el proyecto | Revisar y restringir antes de cualquier deploy |

---

## PARTE 2 — FIRESTORE INDEXES

### Organización por módulo en el JSON

Firebase CLI no soporta múltiples archivos de índices, por eso
el orden y los comentarios son la única forma de mantener la auditoría.

Estructura objetivo de `firestore.indexes.json`:

```json
{
  "indexes": [

    // -------------------------------------------------------
    // MÓDULO: SHARED
    // Colecciones: users, notifications, tasks, roles
    // -------------------------------------------------------
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "requestOwnerId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },

    // -------------------------------------------------------
    // MÓDULO: HCM
    // Colecciones: employees, attendance, incidences, etc.
    // -------------------------------------------------------
    {
      "collectionGroup": "attendance",
      "queryScope": "COLLECTION",
      "fields": [...]
    },

    // -------------------------------------------------------
    // MÓDULO: BPMN (añadir cuando se retome)
    // Colecciones: processes, process_instances, bpmn_tasks
    // -------------------------------------------------------

    // -------------------------------------------------------
    // MÓDULO: CRM (añadir cuando se desarrolle)
    // Colecciones: contacts, opportunities, crm_activities
    // -------------------------------------------------------

  ],
  "fieldOverrides": [

    // -------------------------------------------------------
    // FIELD OVERRIDES — HCM
    // -------------------------------------------------------
    {
      "collectionGroup": "employees",
      "fieldPath": "...",
      "indexes": [...]
    }

  ]
}
```

### Checklist antes de añadir un índice nuevo

```
[ ] Identifiqué a qué módulo y colección pertenece el índice
[ ] Lo inserté dentro del bloque de comentario del módulo correcto
[ ] Verifiqué que no existe ya un índice similar para la misma colección
    (buscar por collectionGroup antes de añadir)
[ ] Si es para una colección nueva de módulo nuevo:
    añadí el bloque de comentario de sección del módulo
[ ] No modifiqué índices de otro módulo para resolver un query del módulo actual
    (si un query necesita índice especial, crear índice nuevo, no alterar el existente)
```

### Señales de alerta en firestore.indexes.json

| Señal | Riesgo | Acción |
|---|---|---|
| Índice compuesto con 4+ campos | Costo elevado de escritura | Revisar si el query puede simplificarse |
| Dos índices con los mismos campos en distinto orden | Probable duplicado | Consolidar o documentar por qué ambos son necesarios |
| Índice para colección sin sección de comentario | No se sabe a qué módulo pertenece | Añadir comentario de módulo |
| Field override que deshabilita índices por defecto | Puede romper queries existentes | Verificar todos los queries que usan ese campo antes de aplicar |

---

## PARTE 3 — SEGURIDAD MÍNIMA POR MÓDULO

### Principio de mínimo privilegio aplicado por módulo

Cada módulo define exactamente qué roles pueden leer y escribir sus colecciones.
No usar reglas genéricas que den acceso amplio "por si acaso":

```
// ❌ PROHIBIDO — demasiado permisivo, ignora el módulo
allow read: if isSignedIn();

// ✅ CORRECTO — acceso explícito por módulo y rol
allow read: if isSignedIn() && hasModule('hcm_employees');
allow write: if isSignedIn() && hasModule('hcm_employees') && hasRole('HRManager');
```

### Permisos mínimos por tipo de operación

| Operación | Quién puede | Cómo verificar |
|---|---|---|
| Leer lista de empleados | Rol con `hcm_employees` read | `hasModule('hcm_employees')` |
| Modificar datos de empleado | HRManager o Admin | `hasModule('hcm_employees') && hasRole('HRManager')` |
| Leer procesos BPMN | Rol con `bpmn_viewer` | `hasModule('bpmn_viewer')` |
| Crear instancia de proceso | Rol con `bpmn_admin` | `hasModule('bpmn_admin')` |
| Acceso cruzado BPMN → employees | Cualquier usuario con bpmn_viewer | Definir en sección Accesos Cruzados |

### Al añadir un módulo nuevo al sidebar

Este flujo ya existe en el proyecto pero se documenta aquí como recordatorio
porque afecta directamente a las reglas de seguridad:

```
1. Definir AppModule para el nuevo módulo (auth.types.ts)
2. Añadir permisos default en SYSTEM_ROLES (role-actions.ts) para TODOS los roles
3. Añadir sección del módulo en firestore.rules con reglas explícitas
4. El sidebar filtrará automáticamente vía canRead(item.module)
```

Si falta el paso 3, el módulo aparece en el sidebar pero Firestore rechaza
las queries en runtime con "Missing or insufficient permissions" sin indicar
exactamente qué regla falta.

---

## PARTE 4 — ESTRATEGIA DE ESCALADO FUTURO

### Cuándo considerar pre-procesador de reglas

Si `firestore.rules` supera las 1,200 líneas o si hay más de 4 módulos activos,
evaluar implementar un script de build que consolide archivos parciales:

```
scripts/
└── merge-rules.js     → concatena archivos .rules por módulo antes del deploy

firestore-rules/
├── 00-helpers.rules
├── 01-shared.rules
├── 02-hcm.rules
├── 03-bpmn.rules
├── 04-crm.rules
└── 05-cross-module.rules
```

El script ejecuta antes de `firebase deploy` y genera el `firestore.rules` final.
**No implementar esto todavía** — la estructura actual de comentarios es suficiente.
Documentarlo aquí para que cuando llegue ese momento exista la estrategia definida.

### Umbral para activar el pre-procesador

```
firestore.rules  > 1,200 líneas   → evaluar pre-procesador
                 > 1,500 líneas   → implementar pre-procesador antes del siguiente módulo
firestore.indexes.json > 1,000 líneas → evaluar si algún módulo puede separar sus colecciones
```

---

## PARTE 5 — COMPORTAMIENTO CRÍTICO DE FIRESTORE

> Documentación completa → `firebase-scale-firestore-behavior.md`

| Comportamiento | Regla |
|---|---|
| Fechas `YYYY-MM-DD` | Nunca `.toISOString()` completo — usar `.split('T')[0]` |
| Reglas aditivas | Nunca `allow write` genérico — declarar `create/update/delete` por separado |
| Campos en Maps | No usar en `where()` — subir al nivel superior del documento |


## RESUMEN DE RESPONSABILIDADES POR ARCHIVO

| Archivo | Responsabilidad | Quién lo modifica |
|---|---|---|
| `firestore.rules` | Seguridad de acceso por colección y rol | Solo al añadir módulo, colección o tipo nuevo |
| `firestore.indexes.json` | Performance de queries compuestos | Solo cuando Firestore pida índice explícitamente |
| `src/types/auth.types.ts` | Definición de AppModule y roles | Al añadir módulo nuevo al sidebar |
| `src/hooks/use-permissions.ts` | Resolución de permisos en cliente | Al cambiar lógica de roles, no al añadir módulo |
| `role-actions.ts` | Defaults de SYSTEM_ROLES | Al añadir módulo nuevo, actualizar todos los roles |