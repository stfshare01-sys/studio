# Firebase Scale — Referencia Adicional

Este archivo contiene los checklists, señales de alerta y la estrategia futura para escalar el sistema de reglas y configuración de Firebase en el proyecto. Es un complemento de `Firebase scale.md`.

## PARTE 1 — FIRESTORE SECURITY RULES

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

## PARTE 2 — FIRESTORE INDEXES

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
