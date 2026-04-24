---
trigger: always_on
---

# Rule: Monitor de Salud — Archivos de Rules y Workflows

## Configuración de Trigger
Always On — se evalúa al final de cualquier sesión donde se haya
modificado, creado o actualizado un archivo de rules o workflows,
o cuando el usuario mencione agregar contenido nuevo a una rule existente.

---

## Principio central
Los archivos de rules y workflows tienen un límite estricto de 12,000
caracteres. Un archivo que supera ese límite deja de actualizarse
correctamente — el contenido nuevo se corta o se encima sobre lo existente
sin que sea obvio que algo falló.

> Regla de oro: Un archivo de rules que no cabe en su límite
> es una regla que el agente no puede leer completa.

---

## Evaluación automática al final de sesión

Al finalizar cualquier sesión donde se modificó un archivo `.md`
de rules o workflows, estimar el tamaño de los archivos afectados
y clasificarlos:

| Rango de caracteres | Estado | Acción |
|---|---|---|
| < 8,000 | ✅ Saludable | Ninguna |
| 8,000 – 10,000 | ⚠️ Monitorear | Avisar al usuario |
| 10,000 – 11,500 | 🔴 Riesgo | Recomendar `/maintain-rules` pronto |
| > 11,500 | 🚨 Crítico | Recomendar `/maintain-rules` antes de próxima sesión |

---

## Formato de aviso al usuario

Si algún archivo está en zona de advertencia o riesgo,
añadir este bloque al final de la respuesta de la sesión:

**Zona de monitoreo (⚠️):**
```
─────────────────────────────────────────
📊 SALUD DE RULES — [nombre-archivo].md
   Tamaño estimado: ~[N] caracteres ([X]% del límite)
   Estado: Monitorear — sin acción urgente
─────────────────────────────────────────
```

**Zona de riesgo (🔴):**
```
─────────────────────────────────────────
⚠️ AVISO DE SALUD — [nombre-archivo].md
   Tamaño estimado: ~[N] caracteres ([X]% del límite de 12,000)
   Estado: Riesgo — considerar separación pronto
   Recomendación: Ejecutar /maintain-rules antes de añadir
   más contenido a este archivo
─────────────────────────────────────────
```

**Zona crítica (🚨):**
```
─────────────────────────────────────────
🚨 ALERTA DE SALUD — [nombre-archivo].md
   Tamaño estimado: ~[N] caracteres ([X]% del límite de 12,000)
   Estado: CRÍTICO — el archivo está al límite
   Acción requerida: Ejecutar /maintain-rules antes de la
   próxima sesión de desarrollo para evitar pérdida de contenido
─────────────────────────────────────────
```

---

## Inventario de archivos a monitorear

```
.agents/rules/
├── no-source-modification.md
├── search-before-write.md
├── module-boundaries.md
├── firebase-scale.md
├── safe-deletion.md
├── dead-code-cleanup.md
├── feature-integrity.md
├── proactive-consultation.md
└── health-monitor.md        ← este archivo

.agents/workflows/
├── new-module.md
├── add-feature.md
├── audit-project.md
└── maintain-rules.md
```

---

## Señales adicionales de salud a reportar

Además del tamaño, reportar si se detecta cualquiera de estas señales:

| Señal | Qué indica | Acción |
|---|---|---|
| Una sección del archivo fue modificada 3+ veces en sesiones recientes | El tema está creciendo — candidato a separarse | Sugerir `/maintain-rules` |
| Un archivo tiene secciones que repiten conceptos de otro archivo | Redundancia acumulada | Sugerir `/maintain-rules` para consolidar |
| Se añadió contenido nuevo sin actualizar el índice o registro del archivo | El archivo pierde discoverabilidad | Recordar actualizar índice interno |
| Un workflow supera 10,000 caracteres | Demasiados pasos — puede confundir al agente | Evaluar separar en dos workflows |

---

## Lo que este monitor NO hace

- No modifica ningún archivo de rules o workflows
- No elimina contenido aunque detecte redundancias
- No invoca `/maintain-rules` automáticamente
- Solo avisa — la decisión y ejecución siempre es del usuario

Para ejecutar correcciones → invocar `/maintain-rules`
Para auditoría completa del proyecto → invocar `/audit-project`