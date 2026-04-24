---
trigger: model_decision
description: Activar esta regla después de cualquier operación que elimine, refactorice, mueva o reemplace código existente. También activar cuando el usuario pida "limpiar", "ordenar" o "refactorizar" el código.
---

# Rule: Limpieza de Código Muerto

---

## Principio central
Toda operación de borrado o refactorización debe dejar el código
más limpio de lo que lo encontró.
No se aceptan residuos — imports huérfanos, variables sin uso,
funciones sin llamadas ni archivos vacíos.

---

## Checklist de limpieza obligatorio post-modificación

Ejecutar en este orden después de cualquier borrado o refactorización:

```bash
# 1. Verificar importaciones huérfanas
grep -r "import.*[elemento-modificado]" src/
# Resultado esperado: cero referencias al elemento eliminado

# 2. Verificar TypeScript — sin warnings de variables sin uso
npx tsc --noEmit
# Resultado esperado: cero errores nuevos

# 3. Verificar linting
npm run lint
# Resultado esperado: cero errores nuevos introducidos por el cambio
```

---

## Categorías de código muerto a eliminar

### Importaciones huérfanas
```ts
// ❌ RESIDUO — import de algo que ya no existe o no se usa
import { DeletedFunction } from '@/firebase/actions/deleted-file';
import { UnusedType } from '@/types/hcm.types';

// Acción: eliminar la línea de import completa
```

### Variables declaradas sin uso
```ts
// ❌ RESIDUO
const unusedData = await getSomeData();  // declarada pero nunca usada

// Acción: eliminar la declaración
// Excepción: si el efecto secundario del llamado importa,
// eliminar solo la asignación: await getSomeData();
```

### Funciones exportadas sin importadores
```ts
// ❌ RESIDUO — función que ya nadie llama
export async function oldEmployeeSync() { ... }

// Verificar: grep -r "oldEmployeeSync" src/ → cero resultados
// Acción: eliminar la función
// Excepción: si es reservada para uso futuro conocido →
// documentar con: // RESERVADO: [módulo que lo usará] — [fecha estimada]
```

### Types e interfaces sin referencias
```ts
// ❌ RESIDUO en *.types.ts
export interface OldAttendanceFormat { ... }
// grep -r "OldAttendanceFormat" src/ → cero resultados

// Acción: eliminar del archivo de tipos
```

### Archivos vacíos o con solo comentarios
```
// Acción: eliminar del repositorio
// No dejar archivos placeholder sin contenido real
// Excepción: archivos de scaffolding de /new-module
//            que están en construcción activa y documentada
```

---

## Código muerto que se conserva intencionalmente

Si existe código sin uso actual pero con propósito futuro documentado,
conservarlo con este comentario obligatorio:

```ts
// RESERVADO: Este código será utilizado por el módulo [nombre]
// cuando se retome/implemente en [fecha estimada o condición].
// No eliminar sin consultar module-boundaries.md
export function reservedForBPMN() { ... }
```

Sin este comentario, cualquier función sin importadores es candidata
a eliminación en la próxima limpieza.

---

## Señales de código muerto a reportar siempre

| Señal | Umbral | Acción |
|---|---|---|
| Import sin usar | Cualquiera | Eliminar en el mismo commit |
| Variable `const x` sin uso posterior | Cualquiera | Eliminar o documentar RESERVADO |
| Función exportada sin importadores | Cualquiera | Proponer eliminación al usuario |
| Archivo con solo re-exports de algo inexistente | Cualquiera | Eliminar el archivo |
| Comentarios `// TODO` sin fecha o responsable | Cualquiera | Convertir en tarea documentada o eliminar |
| Comentarios `// TODO` con más de 30 días | Cualquiera | Reportar como deuda técnica |

---

## Confirmación explícita requerida

Al finalizar cualquier borrado o refactorización, confirmar explícitamente.
**El agente nunca puede declarar "listo" sin este bloque:**

```
Limpieza completada:
  ✓ Importaciones huérfanas: [N eliminadas / ninguna encontrada]
  ✓ Variables sin uso: [N eliminadas / ninguna encontrada]
  ✓ Funciones sin importadores: [N eliminadas / N conservadas como RESERVADO]
  ✓ Types sin referencias: [N eliminados / ninguno encontrado]
  ✓ Referencias rotas: ninguna
  ✓ TypeScript: sin errores (npx tsc --noEmit)
  ✓ Linting: sin errores nuevos (npm run lint)
```

---

## Relación con otras reglas

- Si durante la limpieza se detecta una función compartida que
  se estaba usando incorrectamente → aplicar `no-source-modification.md`
- Si durante la limpieza se detectan funciones duplicadas →
  aplicar `search-before-write.md` sección de señales de duplicación
- Si un archivo supera los límites de tamaño después de la limpieza →
  Ver: firebase coding standards.md — Sección 2. Límites de tamaño