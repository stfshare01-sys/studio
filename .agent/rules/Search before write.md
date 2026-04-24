---
trigger: always_on
---

# Rule: Buscar Antes de Escribir

## Rol de esta regla
Prevenir la regeneración de código que ya existe, evitando duplicados,
inconsistencias y conflictos silenciosos entre implementaciones paralelas.

---

## PRINCIPIO CENTRAL (OBLIGATORIO)

Antes de escribir cualquier función, hook, tipo, query o componente,
**verificar que no exista ya una implementación en el proyecto.**

> Regla de oro: El código que ya funciona es el más valioso del proyecto.
> Escribir una segunda versión no lo mejora — lo fragmenta.

---

## PROTOCOLO DE BÚSQUEDA (Ejecutar en este orden)

### Paso 1 — Buscar por responsabilidad, no por nombre de archivo

Antes de crear cualquier cosa, identificar qué tipo de elemento se necesita
y buscar en la ubicación canónica correspondiente:

| Necesito... | Buscar primero en... |
|---|---|
| Leer datos de Firestore | `src/firebase/firestore/` y `src/firebase/actions/*-queries.ts` |
| Escribir/mutar datos | `src/firebase/actions/*-mutations.ts` |
| Lógica de permisos | `src/hooks/use-permissions.ts` |
| Tipos de empleados, asistencia, HCM | `src/types/hcm.types.ts` |
| Tipos de autenticación o roles | `src/types/auth.types.ts` |
| Tipos compartidos entre módulos | `src/types/common.types.ts` |
| Componente UI reutilizable | `src/components/` |
| Utilidad/helper puro | `src/lib/` |
| Contexto de Firebase | `src/firebase/provider.tsx` |

### Paso 2 — Búsqueda activa en el código

Si la ubicación canónica no es suficiente, ejecutar búsqueda explícita:

```bash
# Buscar por nombre de función o concepto clave
grep -r "nombreFuncion" src/
grep -r "getEmployee" src/firebase/
grep -r "AttendanceRecord" src/types/

# Buscar por colección de Firestore que se va a usar
grep -r "'attendance'" src/firebase/
grep -r "collection(db, 'employees')" src/
```

### Paso 3 — Revisar el índice de módulo activo

Antes de crear algo en HCM, revisar qué archivos existen actualmente en:
```
src/firebase/actions/        → lista de queries y mutations existentes
src/app/hcm/                 → estructura de rutas y páginas activas
src/types/                   → tipos ya definidos
src/hooks/                   → hooks disponibles
```

---

## REGLAS DE DECISIÓN POST-BÚSQUEDA

### Si ya existe una implementación:

```
¿La implementación existente hace exactamente lo que necesito?
│
├── SÍ → Importarla y usarla. No escribir nada nuevo.
│         Documentar el import con comentario si no es obvio de dónde viene.
│
├── CASI — necesito una variación pequeña
│   ├── ¿La variación es un caso específico del comportamiento general?
│   │   └── SÍ → Crear función nueva con nombre descriptivo en el mismo archivo.
│   │             No modificar la función original. (Ver: no-source-modification.md)
│   └── ¿La variación requiere lógica completamente distinta?
│       └── SÍ → Crear archivo nuevo en el módulo correspondiente.
│                 Nombrar claramente para que sea discoverable.
│
└── NO — encontré algo con nombre similar pero diferente responsabilidad
    └── Reportar antes de proceder:
        "Encontré [archivo/función] que parece relacionado pero hace X.
         Lo que necesito hace Y. ¿Confirmas que debo crear uno nuevo?"
```

### Si NO existe ninguna implementación:

```
¿Es lógica de lectura de Firestore?     → Crear en *-queries.ts del dominio
¿Es lógica de escritura en Firestore?   → Crear en *-mutations.ts del dominio
¿Es transformación/cálculo puro?        → Crear en *-utils.ts del dominio
¿Es estado de UI?                       → Crear hook use-*.ts
¿Es tipo/interfaz?                      → Añadir a {dominio}.types.ts correspondiente
¿Es componente visual?                  → Crear en src/components/ o módulo si es específico
```

---

## CHECKLIST OBLIGATORIO ANTES DE CREAR UN ARCHIVO NUEVO

```
[ ] Busqué en la ubicación canónica del tipo de elemento que necesito
[ ] Ejecuté grep para el concepto clave (nombre de colección, entidad o función)
[ ] Revisé los archivos existentes del módulo activo
[ ] Confirmé que ninguna función existente cubre este caso, ni parcialmente
[ ] El nombre del archivo nuevo sigue la convención de nomenclatura del proyecto
[ ] Ubiqué el archivo nuevo en la carpeta correcta según su responsabilidad

> [!IMPORTANT]
> Para cambios que afecten múltiples archivos o lógica existente, se recomienda
> utilizar el análisis de impacto detallado definido en el workflow `/add-feature`.
```

---

## CONVENCIÓN DE NOMBRES PARA DISCOVERABILIDAD

Un archivo con nombre incorrecto es código fantasma desde el día uno.
El agente no lo encontrará en búsquedas futuras.

```
// ❌ NOMBRES QUE GENERAN CÓDIGO FANTASMA
helpers.ts              → ¿qué tipo de helpers? ¿de qué dominio?
utils.ts                → demasiado genérico, nadie sabe qué hay adentro
functions.ts            → nombre sin semántica
employeeLogic.ts        → ¿lógica de UI, de datos, de negocio?
misc.ts                 → cementerio de funciones sin hogar

// ✅ NOMBRES QUE HACEN EL CÓDIGO DISCOVERABLE
employee-queries.ts     → queries de lectura del dominio empleados
attendance-mutations.ts → writes del dominio asistencia
tardiness-utils.ts      → utilidades puras de cálculo de retardos
use-employee-filters.ts → hook de estado para filtros de empleados
hcm.types.ts            → tipos del módulo HCM
```

**Regla de nombramiento:** El nombre del archivo debe responder a
`¿qué dominio toca?` + `¿qué tipo de operación hace?`

---

## DOCUMENTACIÓN DE FUNCIONES PARA BÚSQUEDA FUTURA

Cada función exportada debe tener un bloque JSDoc mínimo.
Sin este bloque, el agente no puede determinar si ya existe la funcionalidad.

```ts
// ❌ INVISIBLE PARA BÚSQUEDA FUTURA
export async function getEmpData(id: string) {
  // ...
}

// ✅ DISCOVERABLE — el agente puede encontrar esto en búsquedas semánticas
/**
 * Obtiene el perfil completo de un empleado activo por su ID.
 * Incluye datos personales, puesto, turno y ubicación asignada.
 * NO incluye datos de compensación (ver: compensation-queries.ts).
 *
 * @param employeeId - UID del documento en la colección `employees`
 * @returns Employee completo o null si no existe o está inactivo
 * @throws FirestoreError si el usuario no tiene permiso hcm_employees
 */
export async function getEmployeeById(employeeId: string): Promise<Employee | null> {
  // ...
}
```

**Campos obligatorios en JSDoc:**
- Qué hace la función (una línea)
- Qué NO hace o qué excluye intencionalmente (evita buscarle responsabilidades que no tiene)
- Parámetros con tipo y descripción
- Valor de retorno
- Errores conocidos o restricciones de permiso

---

## SEÑALES DE DUPLICACIÓN — Detectar y reportar

| Señal | Qué significa | Acción |
|---|---|---|
| Dos archivos con nombres similares en el mismo dominio | Probable duplicado por código fantasma | Comparar, consolidar, eliminar el redundante |
| Misma colección de Firestore consultada en 3+ archivos distintos | Lógica de query no centralizada | Mover a `*-queries.ts` canónico del dominio |
| Mismo tipo definido en dos `*.types.ts` | Duplicación de contrato | Mover al más específico, importar desde ahí |
| Función con nombre distinto pero mismo comportamiento | Renombrado sin borrar el original | Deprecar y redirigir al canónico |
| Hook que replica lógica de otro hook existente | No se buscó antes de escribir | Refactorizar para reutilizar |

Cuando se detecte cualquiera de estas señales, reportar antes de continuar:
```
"Detecté posible duplicación entre [A] y [B].
 [A] hace: [descripción]
 [B] hace: [descripción]
 ¿Los consolido o tienen responsabilidades distintas que debo preservar?"
```

---

## REGISTRO DE FUNCIONES CLAVE DEL PROYECTO

> Este registro debe mantenerse actualizado cuando: 
- Se creen funciones de alto impacto o alta reutilización 
- Se renombra o depreca una función existente 
- Se mueve una función a otro archivo 
Es el mapa que evita el código fantasma.

> Mapa técnico completo del módulo HCM → ver docs/hcm/ANALYSIS_HCM_STRUCTURE.md

### Consultas de empleados
- `getEmployeeById(id)` → `employee-queries.ts` — perfil completo por ID
- `getActiveEmployees()` → `employee-queries.ts` — lista de empleados activos

### Permisos
- `usePermissions()` → `use-permissions.ts` — hook principal de permisos
- `canRead(module)` / `canWrite(module)` → vía `usePermissions()`

### Asistencia
- *(completar conforme crecen las funciones del módulo)*

### Tipos base
- `Employee` → `hcm.types.ts`
- `AttendanceRecord` → `hcm.types.ts`
- `AppModule` → `auth.types.ts`
- `UserRole` → `auth.types.ts`

---

## NOTA: RELACIÓN CON OTRAS REGLAS

- Si encontraste la función pero necesitas adaptarla para un módulo nuevo
  → aplicar `no-source-modification.md`
- Si el archivo donde vive la función supera los límites de tamaño
  → Ver: firebase coding standards.md — Sección 2. Límites de tamaño
- Si el tipo que necesitas no existe en ningún `*.types.ts`
  → crearlo en el archivo de tipos del dominio correcto, nunca inline en el componentes