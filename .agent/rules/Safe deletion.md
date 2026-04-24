---
trigger: model_decision
description: Activar esta regla cuando la instrucción del usuario contenga intención de: eliminar, borrar, quitar, remover, limpiar, desactivar o hide de cualquier elemento, componente, función, archivo o módulo.
---

# Rule: Borrado Seguro

---

## Principio central
Eliminar un elemento visual no autoriza eliminar la lógica que lo soporta.
Antes de borrar cualquier componente, función, hook o archivo,
verificar si algo más depende de esa lógica.

---

## Protocolo obligatorio antes de cualquier borrado

```bash
# Paso 1 — Mapear quién usa lo que se va a eliminar
grep -r "[NombreFuncion]" src/
grep -r "[NombreComponente]" src/
grep -r "from.*[nombre-archivo]" src/

# Paso 2 — Clasificar el resultado
# ¿Solo lo usa el elemento que se va a borrar? → borrado seguro
# ¿Lo usan 2+ elementos?                       → desacoplar, no borrar la lógica
```

---

## Árbol de decisión para borrado

```
¿Se pide eliminar un elemento visual (botón, campo, sección, pantalla)?
│
├── Ejecutar grep de dependencias
│
├── ¿La lógica subyacente es usada SOLO por ese elemento?
│   └── SÍ → Borrar elemento Y lógica.
│             Continuar con dead-code-cleanup.md
│
├── ¿La lógica es compartida con otros componentes?
│   └── SÍ → Borrar SOLO el elemento visual.
│             Dejar la lógica intacta.
│             Reportar:
│             "Eliminé [elemento] pero conservé [función]
│              porque también la usa [otro componente]."
│
└── ¿No está claro si la lógica es compartida?
    └── Reportar antes de actuar:
        "Encontré que [función] podría ser usada también por [X].
         ¿Confirmas que puedo eliminarla o solo quieres
         quitar el elemento visual?"
```

---

## Traducción UI↔código antes de borrar

Antes de ejecutar el borrado, confirmar en lenguaje mixto qué se va a eliminar:

**Sin ambigüedad:**
```
Voy a eliminar:
  → [NombreTécnico]  ([cómo lo ve el usuario en pantalla])
     Ruta: src/[ruta/al/archivo]
  → Lógica asociada: [función] en [archivo] — [compartida/exclusiva]

¿Confirmas?
```

**Con ambigüedad (2+ candidatos):**
```
Encontré [N] elementos que coinciden con "[término del usuario]":

  1. [NombreTécnico]  ([descripción visual para el usuario])
                       Ruta: [ruta]

  2. [NombreTécnico]  ([descripción visual para el usuario])
                       Ruta: [ruta]

¿Cuál deseas eliminar?
```

---

## Reporte obligatorio post-borrado

Después de cualquier eliminación, confirmar explícitamente.
No declarar "listo" sin este reporte:

```
Borrado completado:
  ✓ Eliminado: [elemento/archivo/función]
  ✓ Conservado: [lógica que se dejó intacta y por qué]
  ✓ Importaciones actualizadas en: [archivos afectados]
  ✓ Sin referencias rotas: confirmado con grep
  ⏳ Limpieza de código muerto: pendiente (aplicar dead-code-cleanup.md)
```

---

## Señales que requieren confirmación adicional antes de borrar

| Situación | Acción |
|---|---|
| La función a eliminar aparece en 3+ archivos | Listar todos los importadores antes de proceder |
| El elemento es un componente de `src/components/` (shared) | Confirmar impacto en todos los módulos que lo usan |
| Se pide eliminar un módulo completo | Invocar `/new-module` en reversa — auditoría completa primero |
| El elemento existe con el mismo nombre en otro módulo | Confirmar explícitamente cuál de los dos se elimina |
| Se pide "limpiar todo lo que no se usa" | Listar los candidatos y confirmar antes de borrar cualquiera |