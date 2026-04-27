---
description: Mantenimiento de los archivos de rules y workflows de Antigravity. Detecta archivos cerca del límite, elimina redundancias, separa archivos que crecieron demasiado y mantiene el sistema de reglas coherente y sin contradicciones.
---

# Workflow: /maintain-rules

**Importante:** Este workflow solo genera el plan de acción.
No modifica ningún archivo sin confirmación explícita del usuario.

---

## Paso 1 — Inventario y medición

Medir el tamaño actual de cada archivo:

```bash
wc -c .agents/rules/*.md
wc -c .agents/workflows/*.md
```

Clasificar cada archivo según su estado:

| Archivo | Caracteres | % del límite | Estado |
|---|---|---|---|
| no-source-modification.md | [N] | [X]% | [estado] |
| search-before-write.md | [N] | [X]% | [estado] |
| module-boundaries.md | [N] | [X]% | [estado] |
| firebase-scale.md | [N] | [X]% | [estado] |
| safe-deletion.md | [N] | [X]% | [estado] |
| dead-code-cleanup.md | [N] | [X]% | [estado] |
| feature-integrity.md | [N] | [X]% | [estado] |
| proactive-consultation.md | [N] | [X]% | [estado] |
| health-monitor.md | [N] | [X]% | [estado] |
| new-module.md | [N] | [X]% | [estado] |
| add-feature.md | [N] | [X]% | [estado] |
| audit-project.md | [N] | [X]% | [estado] |
| maintain-rules.md | [N] | [X]% | [estado] |

---

## Paso 2 — Análisis de redundancias entre archivos

Revisar si algún concepto aparece documentado en más de un archivo
de forma duplicada o contradictoria:

### Verificaciones específicas

```
¿El límite de líneas de archivos de código está definido igual
en firebase-coding-standards Y en las rules nuevas?
→ Si difieren: identificar cuál es el valor correcto y unificar

¿Las instrucciones de usePermissions() en firebase-coding-standards
contradicen algo en module-boundaries.md o firebase-scale.md?
→ Si hay contradicción: documentar cuál prevalece

¿search-before-write.md y add-feature.md tienen instrucciones
de búsqueda que se contradigan?
→ Si hay contradicción: unificar en search-before-write.md
  y referenciar desde add-feature.md

¿safe-deletion.md y add-feature.md tienen checklists que se repitan?
→ Si se repiten: conservar en el archivo canónico y referenciar
```

---

## Paso 3 — Detección de contenido a separar

Para cada archivo en zona de riesgo (> 11,000 caracteres),
analizar si tiene secciones que puedan vivir en un archivo
complementario referenciado:

### Estrategia de separación

```
Archivo original (conserva el núcleo):
  → Principio central
  → Reglas más consultadas
  → Checklists principales
  → Referencia al archivo complementario

Archivo complementario (contenido secundario):
  → Ejemplos de código extensos
  → Tablas de señales de alerta detalladas
  → Casos edge documentados
  → Historial de decisiones de arquitectura
```

### Nomenclatura para archivos complementarios

```
[nombre-original]-examples.md     → ejemplos de código
[nombre-original]-reference.md    → tablas y señales de alerta
[nombre-original]-decisions.md    → decisiones de arquitectura documentadas
```

---

## Paso 4 — Plan de acción

Presentar el plan antes de ejecutar cualquier cambio:

```
═══════════════════════════════════════════════════
INFORME DE SALUD — RULES Y WORKFLOWS
[fecha]
═══════════════════════════════════════════════════

ARCHIVOS CRÍTICOS (acción inmediata requerida)
──────────────────────────────────────────────
[Si no hay: "Ninguno ✅"]

  🚨 [nombre-archivo].md
     Tamaño: [N] caracteres ([X]% del límite)
     Acción: Separar sección "[nombre]" en [nombre-archivo]-reference.md
     Ahorro estimado: ~[N] caracteres

ARCHIVOS EN RIESGO (acción pronto)
───────────────────────────────────
[Si no hay: "Ninguno ✅"]

  🔴 [nombre-archivo].md
     Tamaño: [N] caracteres ([X]% del límite)
     Acción: Monitorear — separar si crece más de [N] caracteres

REDUNDANCIAS DETECTADAS
────────────────────────
[Si no hay: "Ninguna ✅"]

  ⚠️ Concepto duplicado: [descripción]
     Aparece en: [archivo A] y [archivo B]
     Resolución: Conservar en [archivo canónico], referenciar desde [archivo B]

ARCHIVOS SALUDABLES
────────────────────
  ✅ [lista de archivos bajo 8,000 caracteres]

═══════════════════════════════════════════════════
PLAN DE ACCIÓN
═══════════════════════════════════════════════════

Paso 1 — [acción] en [archivo]
  Resultado esperado: [descripción]
  Impacto: [qué cambia y qué permanece igual]

Paso 2 — [acción] en [archivo]
  ...

¿Confirmas que proceda con el Paso 1?
(Confirma paso por paso — no ejecuto el siguiente sin tu aprobación)
═══════════════════════════════════════════════════
```

---

## Paso 5 — Ejecución (solo con confirmación explícita)

Al recibir confirmación para cada paso:

### Si el paso es separar un archivo

1. Leer el archivo completo
2. Identificar la sección a mover
3. Crear el archivo complementario con esa sección
4. Reemplazar la sección en el archivo original por una referencia:
   ```markdown
   > Ejemplos detallados y casos edge → ver [nombre-complementario].md
   ```
5. Verificar que el archivo original bajó del umbral crítico
6. Reportar resultado antes de continuar al siguiente paso

### Si el paso es resolver una redundancia

1. Identificar cuál archivo es el canónico para ese concepto
2. En el archivo no-canónico, reemplazar el contenido duplicado por:
   ```markdown
   > Ver [archivo-canónico].md — Sección [nombre de sección]
   ```
3. Verificar que la referencia es suficientemente descriptiva
   para que el agente la encuentre
4. Reportar resultado antes de continuar

### Si el paso es actualizar un valor desactualizado

1. Identificar el valor incorrecto y su ubicación exacta
2. Mostrar el cambio propuesto (antes/después) al usuario
3. Esperar confirmación explícita
4. Aplicar el cambio atómicamente — solo esa línea o sección
5. Verificar que no hay otras referencias al valor anterior
   en otros archivos

---

## Reglas de este workflow

```
[ ] Nunca eliminar contenido sin mostrarlo primero al usuario
[ ] Nunca modificar más de un archivo por paso sin confirmación
[ ] Si una separación crea un archivo nuevo → verificar que
    health-monitor.md lo incluye en su inventario
[ ] Si se resuelve una redundancia → verificar que el archivo
    referenciado realmente tiene la información que se está
    referenciando antes de borrar la copia
[ ] Al finalizar → re-ejecutar medición del Paso 1 para confirmar
    que todos los archivos están en zona saludable
```

---

## Cuándo invocar este workflow

| Señal | Urgencia |
|---|---|
| `health-monitor.md` reportó archivo en zona 🔴 o 🚨 | Alta |
| `/audit-project` reportó redundancias entre rules | Media |
| Se añadieron 3+ rules o workflows nuevos recientemente | Media |
| Hace más de 2 meses desde la última ejecución | Baja |
| El agente no encontró una instrucción que debería existir | Alta — posible contenido truncado |