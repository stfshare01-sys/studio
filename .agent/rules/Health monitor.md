---
trigger: always_on
---

# Rule: Monitor de Salud — Archivos de Rules y Workflows

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

---

## Monitor de Código Fuente — Cierre de Sesión

**Trigger adicional:** Al final de cualquier sesión donde se haya creado,
modificado o movido un archivo `.ts` o `.tsx` de código fuente (no rules).

### Verificación obligatoria de README

Al cerrar una sesión de código, verificar:

```
¿Se creó un componente, hook, función o archivo nuevo?
│
├── SÍ → ¿Existe README.md en el módulo?
│         ├── SÍ → ¿Lo menciona? → Si no → actualizar README ahora mismo
│         └── NO → Crear README con plantilla de module-boundaries.md
│
└── NO → No se requiere acción
```

### Archivos de código con READMEs requeridos

```
src/app/hcm/team-management/README.md   ← EXISTE (Abril 2026)
src/app/hcm/prenomina/README.md         ← pendiente
src/firebase/actions/README.md          ← pendiente
```

### Señal de alerta al cerrar sesión de código

Si se creó algo nuevo y el README no fue actualizado, añadir al final de la
respuesta de cierre:

```
─────────────────────────────────────────
📋 README PENDIENTE — [módulo]
   Se creó/modificó: [archivo o función]
   Acción: El README debe reflejar este cambio antes de cerrar
   Path: src/app/hcm/[modulo]/README.md
─────────────────────────────────────────
```

### Lo que NO hace este monitor de código
- No modifica READMEs automáticamente
- Solo avisa si detecta que quedó pendiente al final de sesión
- La actualización la ejecuta el AI en esa misma sesión, nunca en la siguiente