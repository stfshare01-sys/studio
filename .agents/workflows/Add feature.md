---
description: Flujo estructurado para añadir funcionalidad nueva o modificar una existente
---

# Workflow: /add-feature

## Descripción
Flujo estructurado para añadir funcionalidad nueva o modificar una existente
con análisis de impacto previo, garantizando que nada de lo que ya funciona
se rompa en el proceso.

Invocar con: `/add-feature`

---

## Cuándo usar este workflow

- Añadir una nueva pantalla o sección a un módulo existente
- Añadir un campo nuevo a una colección de Firestore
- Modificar el comportamiento de una función que otros archivos ya consumen
- Conectar dos módulos que antes no se comunicaban
- Añadir un nuevo tipo de tarea, permiso o rol
- Modificar un componente compartido en `src/components/`
- Cualquier cambio que toque más de un archivo

Para bugfixes simples en un solo archivo sin exportaciones afectadas,
este workflow es opcional pero recomendable.

---

## Paso 1 — Descripción de la feature

Responder en el chat antes de cualquier acción:

```
¿Qué quiero lograr?: [descripción en una oración]
¿En qué módulo vive?: [hcm / bpmn / crm / shared]
¿Qué archivos creo que necesito tocar?: [lista inicial, puede estar incompleta]
¿Es funcionalidad nueva o modificación de algo existente?: [nueva / modificación]
¿Hay deadline o urgencia?: [sí/no — esto NO omite el análisis, solo lo prioriza]
```

---

## Paso 2 — Búsqueda de implementaciones existentes

Antes de escribir cualquier código, ejecutar el protocolo completo
de `search-before-write.md`:

```bash
# Buscar por concepto clave de la feature
grep -r "[concepto-clave]" src/
grep -r "[nombre-funcion-probable]" src/

# Buscar en la ubicación canónica del tipo de elemento
# (ver tabla de ubicaciones en search-before-write.md)

# Si la feature toca Firestore: buscar la colección
grep -r "'[nombre-coleccion]'" src/firebase/
```

Reportar qué existe antes de continuar:
```
"Búsqueda completada:
 - Encontré: [lista de archivos/funciones relacionadas]
 - No encontré implementación de: [lo que claramente necesito crear]
 - Posible duplicado a revisar: [si aplica]"
```

---

## Paso 3 — Análisis de impacto (OBLIGATORIO)

Este es el paso más importante del workflow.
Antes de proponer cualquier código, mapear el impacto completo:

### 3a. Mapa de dependencias del elemento a modificar

Si se va a modificar algo existente:

```bash
# ¿Quién importa la función o componente que voy a tocar?
grep -r "[nombreFuncion]" src/
grep -r "[NombreComponente]" src/
grep -r "from.*[nombre-archivo]" src/

# ¿Qué tipos usa? ¿Cambiar la función cambia los tipos?
grep -r "[NombreTipo]" src/types/
grep -r "[NombreTipo]" src/
```

### 3b. Clasificación del impacto

```
¿El cambio modifica la firma de una función exportada?
├── SÍ → Impacto ALTO — revisar TODOS los importadores antes de proceder
└── NO → Impacto contenido — continuar

¿El cambio toca un componente en src/components/ (shared)?
├── SÍ → Impacto ALTO — puede afectar múltiples módulos
└── NO → Impacto contenido — continuar

¿El cambio toca firestore.rules o un tipo en auth.types.ts?
├── SÍ → Impacto TRANSVERSAL — probar con todos los roles
└── NO → Continuar

¿El cambio añade un campo nuevo a un documento de Firestore?
├── SÍ → Verificar que el tipo TypeScript se actualiza en *.types.ts
│         y que los componentes que leen ese documento no rompen
└── NO → Continuar

¿La feature nueva necesita algo que ya existe en otro módulo?
├── SÍ → Aplicar no-source-modification.md — crear adaptador
└── NO → Continuar con implementación directa
```

### 3c. Reporte de impacto antes de escribir código

Presentar siempre este reporte antes de proponer cualquier cambio:

```
ANÁLISIS DE IMPACTO — [nombre de la feature]

> [!TIP]
> Para tareas diarias rápidas, usar el Checklist de la Sección 7 en `firebase coding standards.md`.
> Para cambios estructurales o features nuevas, completar este análisis obligatoriamente.

Causa / motivación: [por qué se necesita este cambio]

Archivos que se modifican:
  - [archivo] — [qué cambia exactamente]

Archivos que podrían verse afectados (importadores):
  - [archivo] — [por qué y cómo]

Archivos que NO se tocan (aunque parezca que deberían):
  - [archivo] — [razón]

Riesgo identificado:
  - [descripción del riesgo principal]

Estrategia propuesta:
  OPCIÓN A (mínima): [fix mínimo viable — deuda técnica que genera]
  OPCIÓN B (estructural): [refactorización limpia — esfuerzo estimado]

¿Requiere adaptador?: [sí/no — por qué]
¿Requiere cambio en firestore.rules?: [sí/no]
¿Requiere índice nuevo en firestore.indexes.json?: [sí/no]
¿Requiere actualizar tipos en *.types.ts?: [sí/no — cuál]
```

**Esperar confirmación del usuario sobre la estrategia antes de continuar.**

---

## Paso 4 — Implementación por capas

Implementar en este orden específico. No saltarse capas.

### Capa 1 — Tipos primero

Si la feature introduce datos nuevos o modifica la forma de datos existentes,
actualizar los tipos antes que cualquier otra cosa:

```ts
// src/types/[dominio].types.ts
// Añadir o modificar la interfaz correspondiente
// Si el cambio modifica un tipo existente: verificar todos los usos con tsc
```

```bash
# Verificar que el cambio de tipos no rompe nada antes de continuar
npx tsc --noEmit
```

### Capa 2 — Datos (queries/mutations)

Si la feature necesita leer o escribir en Firestore:

```ts
// Crear o añadir en el archivo canónico del dominio
// [dominio]-queries.ts → solo reads
// [dominio]-mutations.ts → solo writes
// Aplicar JSDoc completo (ver search-before-write.md)
```

```bash
# Si se añade un campo nuevo: verificar si Firestore pide índice
# El error aparecerá en consola con el link directo para crearlo
```

### Capa 3 — Lógica de negocio / utils

Si hay transformaciones, cálculos o reglas de negocio:

```ts
// [dominio]-utils.ts
// Funciones puras sin side effects
// Cada función: una sola responsabilidad
```

### Capa 4 — Hooks de estado (si aplica)

Si la feature necesita estado en el cliente:

```ts
// src/hooks/use-[nombre].ts
// Separar: hook de datos (Firestore) vs hook de UI (estado local)
// No mezclar lógica de Firestore con estado de formulario en el mismo hook
```

### Capa 5 — UI / componentes

Solo hasta aquí llegar a los componentes.
Si se llegó a este paso con los tipos, datos y lógica estables,
la UI es lo que menos riesgo tiene:

```tsx
// Si es componente nuevo específico del módulo:
// src/app/[modulo]/[feature]/[Componente].tsx

// Si es componente reutilizable:
// src/components/[Componente].tsx
// ALERTA: revisar impacto en otros módulos antes de modificar componentes shared
```

### Capa 6 — Permisos y reglas (si aplica)

```
[ ] Si se añade colección nueva → sección en firestore.rules
[ ] Si se añade tipo de task nuevo → array de tipos en firestore.rules
[ ] Si se añade módulo o sub-módulo → AppModule en auth.types.ts
[ ] Si se añade módulo → defaults en SYSTEM_ROLES para todos los roles
```

---

## Paso 5 — Verificación de regresión

Antes de considerar la feature como lista:

### Verificación técnica
```bash
# Type check completo — cero errores permitidos
npx tsc --noEmit

# Linting
npm run lint

# Build completo
npm run build
```

### Verificación funcional manual

Probar los escenarios colaterales al cambio, no solo la feature nueva:

```
[ ] La feature nueva funciona como se describió en el Paso 1
[ ] Las funciones del módulo que no se tocaron siguen operando
[ ] Si se tocó un componente shared: probarlo en los módulos que lo usan
[ ] Si se tocaron reglas de Firestore:
    [ ] Usuario no autenticado → rechazado correctamente
    [ ] Rol Member → acceso según lo definido
    [ ] Rol Admin → acceso completo
[ ] Si se añadió campo nuevo a Firestore:
    [ ] Documentos existentes sin el campo no rompen la UI
    [ ] El tipo TypeScript maneja el campo como opcional si es retrocompatible
```

### Escenario de regresión a documentar

Describir brevemente el escenario que demuestra que la feature no rompió nada:

```
"Escenario de regresión:
 Antes del cambio: [comportamiento base que debe seguir igual]
 Después del cambio: [comportamiento nuevo]
 Verificado en: [archivos / flujos que se probaron manualmente]"
```

---

## Paso 6 — Actualizar documentación

```
[ ] JSDoc actualizado en funciones modificadas o creadas
[ ] README.md del módulo actualizado si se añadieron archivos clave
[ ] Registro de funciones en search-before-write.md actualizado
    si se creó una función de alto impacto o alta reutilización
[ ] Si se añadió colección nueva: actualizar tabla de módulos
    en module-boundaries.md
```

---

## Señales que indican que el análisis fue insuficiente

Si durante la implementación aparece cualquiera de estas situaciones,
detener y volver al Paso 3:

| Señal | Qué indica |
|---|---|
| Se encontró un tercer archivo que también necesita cambiar | El mapa de impacto estaba incompleto |
| El cambio en un tipo rompe más de 3 archivos | El tipo era más compartido de lo previsto — evaluar tipo propio por módulo |
| La feature nueva requiere modificar la lógica de una función que otros módulos usan | Aplicar no-source-modification.md — crear adaptador |
| El build falla en un archivo que no estaba en el mapa de impacto | Hay acoplamiento no documentado — registrarlo antes de continuar |
| [ ] ¿El cambio supera los límites de tamaño permitidos? | Ver: firebase coding standards.md — Sección 2. Límites de tamaño |
| [ ] ¿Hay writes relacionados sin runTransaction? | Envolver antes de hacer el merge |
| Firestore rechaza un query con "Missing or insufficient permissions" | Falta regla en firestore.rules para el módulo o rol correspondiente |
| Firestore pide un índice que no existe | Añadir en la sección correcta de firestore.indexes.json |

---

## Referencia rápida — Reglas relacionadas

| Situación | Regla a aplicar |
|---|---|
| La feature necesita algo de otro módulo | `no-source-modification.md` |
| No sé si ya existe lo que necesito | `search-before-write.md` |
| La feature es para un módulo nuevo | `/new-module` workflow |
| Afecta firestore.rules o indexes | `firebase-scale.md` |
| Afecta fronteras entre módulos | `module-boundaries.md` |
| Necesito guía de arquitectura o límites | `firebase coding standards.md` |