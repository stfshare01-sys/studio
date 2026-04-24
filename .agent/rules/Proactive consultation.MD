---
trigger: model_decision
description: Activar esta regla cuando la instrucción del usuario use términos visuales o de UI, sea ambigua en alcance, mencione elementos que existen en múltiples módulos, o afecte comportamiento global del sistema.
---

# Rule: Consulta Proactiva — Clarificar Antes de Ejecutar

---

## Principio central
Las instrucciones del usuario se expresan en términos visuales
(cómo se ve en pantalla). El código usa términos técnicos.
Antes de ejecutar cualquier cambio ambiguo, traducir y confirmar.
Actuar sobre una interpretación incorrecta genera más trabajo
que tomarse 10 segundos en confirmar.

---

## Cuándo detenerse a confirmar (OBLIGATORIO)

```
¿La instrucción usa términos visuales que mapean a 2+ elementos en código?
├── SÍ → Listar candidatos con traducción UI↔código y esperar confirmación
└── NO → Proceder, pero mostrar interpretación si el cambio afecta
          más de un archivo

¿El término mencionado existe con el mismo nombre en más de un módulo?
├── SÍ → SIEMPRE confirmar — nunca asumir cuál es el correcto
└── NO → Proceder con confirmación simple

¿El cambio afecta comportamiento global (fechas, permisos, reglas, shared)?
├── SÍ → Confirmar alcance antes de ejecutar
└── NO → Proceder

¿La instrucción incluye "todo", "todos", "global", "general", "en todos"?
├── SÍ → Acotar alcance explícitamente antes de actuar
└── NO → Proceder
```

---

## Formato de confirmación con traducción UI↔código

### Caso sin ambigüedad — confirmar antes de ejecutar

```
Voy a modificar:
  → [nombreTécnico]  ([cómo lo ve el usuario en pantalla])
     Ruta: src/[ruta/al/archivo.ts]

¿Es correcto?
```

### Caso con ambigüedad — listar candidatos y esperar

```
Encontré [N] elementos que coinciden con "[término del usuario]":

  1. [nombreTécnico]    ([descripción visual — cómo lo ve el usuario])
                         Ruta: src/[ruta/archivo.ts]

  2. [nombreTécnico]    ([descripción visual — cómo lo ve el usuario])
                         Ruta: src/[ruta/archivo.ts]

  3. [nombreTécnico]    ([descripción visual — cómo lo ve el usuario])
                         Ruta: src/[ruta/archivo.ts]

¿A cuál te refieres?
```

---

## Triggers específicos que requieren confirmación

### Por tipo de cambio

| Instrucción | Por qué confirmar |
|---|---|
| Cambiar formato o tipo de fecha en cualquier campo | Puede afectar queries, índices de Firestore y visualización simultáneamente |
| Cambio en `firestore.rules` o `firestore.indexes.json` | Impacto transversal — afecta todos los módulos y roles |
| Modificar componente en `src/components/` (shared) | Puede romper múltiples módulos sin que sea obvio |
| Cambio que afecta `SYSTEM_ROLES` o `usePermissions()` | Impacto en todos los roles y módulos activos |
| Instrucción sobre módulo en pausa (ej. BPMN) | Confirmar que se quiere retomar antes de modificar |
| "Actualiza/arregla/cambia X en el módulo Y" sin ruta | Buscar X en módulo Y, mostrar candidatos, confirmar |

### Por alcance indefinido

```
// ❌ Instrucciones que requieren acotar alcance antes de ejecutar
"Cambia el formato de fecha"     → ¿en qué campo? ¿en qué módulo?
"Arregla el problema de fechas"  → ¿cuál problema? ¿qué campo?
"Limpia el código"               → ¿qué archivos? ¿qué tipo de limpieza?
"Actualiza el módulo"            → ¿qué parte del módulo? ¿qué actualización?
"Optimiza las queries"           → ¿cuáles queries? ¿cuál es el problema actual?

// Respuesta correcta ante estas instrucciones:
"Para ejecutar esto con precisión, necesito confirmar:
 ¿Te refieres a [interpretación A] o a [interpretación B]?"
```

---

## Búsqueda de candidatos antes de confirmar

Cuando la instrucción es ambigua, ejecutar búsqueda para construir
la lista de candidatos con traducción:

```bash
# Buscar por término visual en nombres de variables y funciones
grep -r "[término]" src/ --include="*.ts" --include="*.tsx"

# Buscar campo específico en tipos
grep -r "[campo]" src/types/

# Buscar en colecciones de Firestore
grep -r "'[coleccion]'" src/firebase/
```

---

## Lo que NO requiere confirmación

Para no volver el agente paralizante, confirmar solo cuando hay
ambigüedad real o impacto transversal:

| Caso | Acción |
|---|---|
| Ruta explícita dada por el usuario | Proceder directo |
| Añadir campo nuevo a un tipo sin modificar existentes | Proceder directo |
| Crear archivo nuevo en carpeta que ya existe | Proceder directo |
| Corrección de typo en texto visible sin lógica involucrada | Proceder directo |
| Cambio en estilos CSS/Tailwind sin efecto en lógica de datos | Proceder directo |
| Bugfix en archivo específico con síntoma claro | Proceder con reporte de causa raíz |

---

## Reporte post-ejecución cuando hubo ambigüedad

Después de ejecutar un cambio que requirió confirmación, reportar:

```
Cambio ejecutado sobre:
  → [nombreTécnico]  ([descripción visual])
     Ruta: [ruta]

Elementos similares NO modificados:
  → [nombreTécnico]  ([descripción visual]) — conservado intacto
     Ruta: [ruta]

¿Es el resultado esperado?
```

---

## Relación con otras reglas

- Si la confirmación revela que se necesita tocar código de otro módulo
  → aplicar `no-source-modification.md`
- Si la confirmación revela que hay 2+ implementaciones del mismo concepto
  → aplicar `search-before-write.md` sección de señales de duplicación
- Si el alcance de la instrucción resulta ser una feature completa
  → activar `feature-integrity.md`