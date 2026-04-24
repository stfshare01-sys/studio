---
trigger: model_decision
description: Activar esta regla cuando el usuario pida crear, añadir, implementar o desarrollar cualquier feature, pantalla, botón, formulario, funcionalidad o módulo nuevo.
---

# Rule: Integridad de Features — Sin Cascarones

---

## Principio central
Una feature no está terminada hasta que UI y lógica están
implementadas Y conectadas entre sí.
Declarar "listo" con solo una capa completada es un error.

---

## Definición de feature completa

Una feature se considera completa cuando todas las capas
que le corresponden están implementadas y conectadas:

| Capa | Completa cuando... |
|---|---|
| Tipo | Interface/type definido en `*.types.ts` |
| Datos | Query o mutation en archivo canónico del dominio |
| Lógica | Utils o hook con la regla de negocio |
| UI | Componente que muestra y/o recibe datos reales |
| Conexión | La UI llama a la lógica real — cero `console.log`, `TODO` o datos hardcodeados |
| Permisos | Verificado con `usePermissions()` si accede a colección protegida |

No todas las features requieren todas las capas.
Antes de iniciar, declarar qué capas aplican para esta feature específica.

---

## Protocolo de inicio — Declarar capas antes de escribir código

Al recibir una petición de feature nueva, antes de escribir cualquier código:

```
Feature solicitada: [descripción]
Capas que aplican:
  ✓ Tipos        — [qué interface/type se necesita]
  ✓ Datos        — [query o mutation en qué archivo]
  ✓ Lógica       — [hook o util necesario]
  ✓ UI           — [componente o página]
  ✓ Conexión     — [cómo UI consume la lógica]
  ✓ Permisos     — [módulo AppModule requerido]

Orden de implementación: Tipos → Datos → Lógica → UI → Conexión → Permisos
¿Confirmas o ajusto el alcance?
```

---

## Protocolo de progreso — Declarar estado al completar cada capa

Al terminar cada capa, reportar estado antes de continuar:

```
Capa completada: [nombre de la capa]

Estado actual:
  ✓ Tipos definidos          — [nombre del type/interface]
  ✓ Query/mutation creada    — [nombre del archivo]
  ⏳ Hook de estado           — pendiente
  ⏳ UI                       — pendiente
  ⏳ Conexión UI↔lógica       — pendiente

¿Continúo con la siguiente capa o prefieres revisar lo completado primero?
```

---

## Casos prohibidos — Código que aparenta funcionar pero no funciona

```tsx
// ❌ PROHIBIDO — botón sin handler real
<Button onClick={() => console.log('TODO: implementar')}>
  Aprobar
</Button>

// ❌ PROHIBIDO — datos hardcodeados en lugar de query real
const employees = [
  { id: '1', name: 'Juan' }, // datos falsos
];

// ❌ PROHIBIDO — formulario sin mutation conectada
async function handleSubmit() {
  // TODO: conectar con Firebase
}

// ❌ PROHIBIDO — hook que devuelve datos estáticos
export function useIncidences() {
  return { data: [], loading: false }; // sin query real
}

// ✅ CORRECTO — UI conectada a lógica real
const { mutate: approveIncidence, isPending } = useApproveIncidence();

<Button
  onClick={() => approveIncidence(incidenceId)}
  disabled={isPending}
>
  Aprobar
</Button>
```

---

## Verificación de conexión UI↔lógica antes de declarar "listo"

```bash
# Buscar TODOs pendientes en los archivos de la feature
grep -r "TODO" src/[ruta-de-la-feature]
grep -r "console.log" src/[ruta-de-la-feature]

# Buscar datos hardcodeados
grep -r "\[\]" src/[ruta-de-la-feature]        # arrays vacíos como placeholder
grep -r "placeholder" src/[ruta-de-la-feature] # datos de prueba olvidados
```

---

## Reporte de feature completa

El agente nunca puede declarar "listo" sin este bloque:

```
Feature completada: [nombre]

Capas implementadas:
  ✓ Tipos:      [NombreType] en [archivo.types.ts]
  ✓ Datos:      [nombreFuncion()] en [archivo-queries/mutations.ts]
  ✓ Lógica:     [useNombreHook()] en [use-nombre.ts]
  ✓ UI:         [NombreComponente] en [ruta/Componente.tsx]
  ✓ Conexión:   UI consume [nombreFuncion] vía [useNombreHook]
  ✓ Permisos:   protegido con usePermissions() — módulo [AppModule]

Verificación:
  ✓ Sin TODOs pendientes en archivos de la feature
  ✓ Sin datos hardcodeados
  ✓ TypeScript: sin errores (npx tsc --noEmit)
  ✓ Linting: sin errores nuevos
```

---

## Excepción válida — Scaffolding intencional

La única excepción a esta regla es cuando se invoca `/new-module`.
En ese caso los archivos esqueleto vacíos son el resultado esperado
porque el módulo está en construcción deliberada y documentada.

Fuera de ese contexto, ninguna feature entregada puede tener
capas vacías o con lógica simulada.

---

## Relación con otras reglas

- Antes de crear queries o mutations → aplicar `search-before-write.md`
  para verificar que no existen ya
- Si la feature necesita datos de otro módulo → aplicar
  `no-source-modification.md` y crear adaptador
- Si la feature es un módulo completo nuevo → invocar `/new-module`
  en lugar de este flujo