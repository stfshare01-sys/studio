---
description: Auditoría completa del proyecto en dos dimensiones
---

# Workflow: /audit-project

## Descripción
Auditoría completa del proyecto en dos dimensiones:
1. El código del proyecto cumple con todas las rules establecidas
2. Los archivos de rules y workflows están en buen estado

Invocar con: `/audit-project`

**Importante:** Este workflow solo genera el informe.
No ejecuta ningún cambio sin confirmación explícita del usuario.

---

## FASE 1 — Auditoría del Código contra las Rules

### 1.1 — Verificar no-source-modification.md

```bash
# Buscar imports cruzados directos entre módulos (sin adaptador)
grep -r "from.*modules/hcm" src/modules/bpmn/
grep -r "from.*modules/hcm" src/modules/crm/
grep -r "from.*modules/bpmn" src/modules/hcm/
grep -r "from.*modules/crm" src/modules/hcm/

# Buscar tipos de HCM usados directamente en otros módulos
grep -r "from.*types/hcm.types" src/modules/bpmn/
grep -r "from.*types/hcm.types" src/modules/crm/

# Buscar si algún módulo accede directamente a colecciones de otro
grep -r "collection(db, 'employees')" src/modules/bpmn/
grep -r "collection(db, 'employees')" src/modules/crm/
```

Reportar: accesos cruzados sin adaptador encontrados.

### 1.2 — Verificar search-before-write.md

```bash
# Buscar posibles funciones duplicadas por nombre similar
grep -rn "export async function get" src/firebase/ | sort
grep -rn "export async function create" src/firebase/ | sort
grep -rn "export async function update" src/firebase/ | sort

# Buscar tipos definidos en más de un archivo
grep -rn "export interface Employee" src/
grep -rn "export type Employee" src/

# Buscar colecciones consultadas en múltiples archivos fuera de su canónico
grep -rn "collection(db, 'attendance')" src/ | grep -v "attendance-queries"
grep -rn "collection(db, 'employees')" src/ | grep -v "employee-queries"
```

Reportar: duplicados de funciones o tipos encontrados.

### 1.3 — Verificar module-boundaries.md

```bash
# Verificar que cada módulo tiene README.md
ls src/modules/*/README.md 2>/dev/null || echo "FALTA README en módulos"
ls src/app/hcm/README.md 2>/dev/null || echo "FALTA README en HCM"

# Buscar lógica de módulos mezclada en lugares incorrectos
grep -rn "bpmn" src/app/hcm/ --include="*.ts" --include="*.tsx"
grep -rn "crm" src/app/hcm/ --include="*.ts" --include="*.tsx"

# Verificar colecciones de módulo en sección incorrecta de firestore.rules
# (revisión manual — buscar si índices de BPMN están en sección HCM)
grep -n "processes\|bpmn_tasks\|process_instances" firestore.rules
```

Reportar: violaciones de fronteras de módulo encontradas.

### 1.4 — Verificar feature-integrity.md

```bash
# Buscar botones o handlers sin lógica real
grep -rn "console.log" src/app/ --include="*.tsx"
grep -rn "TODO" src/app/ --include="*.tsx" --include="*.ts"
grep -rn "// TODO" src/firebase/ --include="*.ts"

# Buscar datos hardcodeados usados como placeholder
grep -rn "placeholder\|fake\|mock\|dummy" src/app/ --include="*.tsx"

# Buscar formularios sin mutation conectada
grep -rn "handleSubmit\|onSubmit" src/app/ --include="*.tsx" | \
  grep -v "mutation\|mutate\|action"
```

Reportar: cascarones o features incompletas encontradas.

### 1.5 — Verificar dead-code-cleanup.md

```bash
# Detectar imports no utilizados (TypeScript los marca)
npx tsc --noEmit 2>&1 | grep "declared but never"
npx tsc --noEmit 2>&1 | grep "is defined but never used"

# Buscar funciones exportadas sin importadores
grep -rn "^export" src/firebase/actions/ --include="*.ts" | \
  while read line; do
    fname=$(echo $line | grep -o "function [a-zA-Z]*" | head -1 | awk '{print $2}')
    count=$(grep -r "$fname" src/ --include="*.ts" --include="*.tsx" | wc -l)
    if [ "$count" -lt 2 ]; then echo "SIN IMPORTADORES: $fname"; fi
  done

# Verificar linting general
npm run lint 2>&1 | grep "error" | head -20
```

Reportar: código muerto o huérfano encontrado.

### 1.6 — Verificar firebase-scale.md

```bash
# Contar líneas actuales de archivos críticos
wc -l firestore.rules
wc -l firestore.indexes.json

# Verificar que cada sección de módulo tiene encabezado
grep -n "MÓDULO:" firestore.rules

# Buscar reglas sin módulo identificado (fuera de sección)
grep -n "allow read\|allow write\|allow create" firestore.rules | head -30

# Buscar fechas con .toISOString() sin .split('T')[0]
grep -rn "toISOString()" src/ --include="*.ts" --include="*.tsx" | \
  grep -v "split\|\.split"

# Buscar campos anidados usados en queries
grep -rn "where('" src/ --include="*.ts" | grep "\."

# Buscar allow write genérico en colecciones protegidas
grep -n "allow write" firestore.rules
```

Reportar: violaciones de escala, fechas incorrectas, campos anidados en queries.

### 1.7 — Verificar safe-deletion.md y proactive-consultation.md

Estos son reglas de comportamiento del agente, no del código.
Se auditan en la Fase 2.

---

## FASE 2 — Auditoría de Rules y Workflows

### 2.1 — Salud de archivos

Para cada archivo en `.agents/rules/` y `.agents/workflows/`:

```bash
# Estimar tamaño de cada archivo
wc -c .agents/rules/*.md
wc -c .agents/workflows/*.md
```

Clasificar cada archivo:

| Rango | Estado |
|---|---|
| < 8,000 caracteres | ✅ Saludable |
| 8,000 – 10,000 caracteres | ⚠️ Monitorear |
| 10,000 – 11,500 caracteres | 🔴 Riesgo — planear separación |
| > 11,500 caracteres | 🚨 Crítico — separar antes de próxima sesión |

### 2.2 — Redundancias entre archivos

Verificar si algún concepto está documentado en más de un archivo
de manera contradictoria o redundante:

- ¿El límite de líneas de archivos está definido igual en `firebase-coding-standards`
  y en las rules nuevas?
- ¿Las instrucciones de `usePermissions()` en `firebase-coding-standards`
  contradicen algo en `module-boundaries.md` o `firebase-scale.md`?
- ¿Hay instrucciones de búsqueda antes de escribir tanto en
  `search-before-write.md` como en `add-feature.md` que se contradigan?

### 2.3 — Cobertura de las rules sobre el código actual

Verificar que las rules cubren los patrones que realmente existen en el proyecto:

- ¿La nomenclatura de archivos en el código coincide con la definida en
  `firebase-coding-standards`?
- ¿Los módulos activos (HCM) tienen la estructura de carpetas que
  `module-boundaries.md` establece?
- ¿El README de HCM existe y está actualizado según `module-boundaries.md`?

---

## FASE 3 — Informe de Auditoría

Presentar el informe en este formato antes de cualquier acción:

```
═══════════════════════════════════════════════════
INFORME DE AUDITORÍA — [fecha]
═══════════════════════════════════════════════════

RESUMEN EJECUTIVO
─────────────────
  Riesgos críticos:    [N]
  Advertencias:        [N]
  Items limpios:       [N]
  Archivos analizados: [N]

─────────────────────────────────────────────────
SECCIÓN 1 — RIESGOS CRÍTICOS (requieren acción inmediata)
─────────────────────────────────────────────────
[Si no hay, escribir: "Ninguno encontrado ✅"]

  🚨 [descripción del riesgo]
     Archivo: [ruta]
     Rule violada: [nombre de la rule]
     Acción recomendada: [descripción]
     Workflow sugerido: [/add-feature | /new-module | corrección manual]

─────────────────────────────────────────────────
SECCIÓN 2 — ADVERTENCIAS (deuda técnica a resolver pronto)
─────────────────────────────────────────────────
[Si no hay, escribir: "Ninguna encontrada ✅"]

  ⚠️ [descripción]
     Archivo: [ruta]
     Rule relacionada: [nombre]
     Acción recomendada: [descripción]

─────────────────────────────────────────────────
SECCIÓN 3 — SALUD DE RULES Y WORKFLOWS
─────────────────────────────────────────────────

  [nombre-archivo].md — [tamaño] caracteres — [estado]
  ...

  Redundancias detectadas: [descripción o "Ninguna"]

─────────────────────────────────────────────────
SECCIÓN 4 — CÓDIGO LIMPIO (confirmaciones positivas)
─────────────────────────────────────────────────

  ✅ [aspecto verificado que cumple con las rules]
  ...

─────────────────────────────────────────────────
PLAN DE ACCIÓN SUGERIDO
─────────────────────────────────────────────────

Paso 1 — [acción más urgente] → [workflow o acción manual]
Paso 2 — [siguiente acción]   → [workflow o acción manual]
...

═══════════════════════════════════════════════════

¿Deseas que proceda con el Plan de Acción?
Si es así, indica por cuál paso quieres comenzar
y ejecutaré el workflow correspondiente.
```

---

## FASE 4 — Ejecución (solo con confirmación explícita)

Después de presentar el informe, esperar respuesta del usuario.

Si el usuario confirma un paso del plan, invocar el workflow correspondiente:

| Tipo de hallazgo | Workflow a invocar |
|---|---|
| Feature incompleta (cascarón) | Continuar con `feature-integrity.md` como guía |
| Módulo nuevo necesita estructura | `/new-module` |
| Funcionalidad existente necesita corrección | `/add-feature` |
| Código muerto o imports huérfanos | Aplicar `dead-code-cleanup.md` |
| Archivos de rules cerca del límite | `/maintain-rules` |
| Violación de fronteras de módulo | Aplicar `no-source-modification.md` |

**Nunca ejecutar más de un paso del plan sin confirmación entre pasos.**
Cada paso modifica el código — el usuario debe validar antes de continuar
con el siguiente para evitar encadenar cambios no deseados.

---

## Notas sobre módulos en pausa

Si durante la auditoría se detecta código de BPMN u otros módulos
en pausa mezclado en lugares incorrectos (ej. dentro de HCM),
reportarlo como advertencia pero NO moverlo automáticamente.

Reportar así:
```
⚠️ Código de módulo en pausa detectado fuera de su carpeta
   Encontrado: [archivo] contiene lógica de [módulo en pausa]
   Ubicación correcta: src/modules/[módulo]/
   Acción: Invocar /new-module para [módulo] antes de mover el código,
           para establecer la estructura correcta primero.
```