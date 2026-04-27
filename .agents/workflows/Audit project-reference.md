# Audit Project — Referencia Adicional

Este archivo contiene los comandos bash detallados para ejecutar la auditoría del proyecto. Es un complemento del workflow `Audit project.md`.

## Comandos para FASE 1 — Auditoría del Código contra las Rules

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

## Comandos para FASE 2 — Auditoría de Rules y Workflows

### 2.1 — Salud de archivos
```bash
# Estimar tamaño de cada archivo
wc -c .agents/rules/*.md
wc -c .agents/workflows/*.md
```
