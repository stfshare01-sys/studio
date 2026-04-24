---
description: Flujo para crear un módulo nuevo o retomar uno en pausa sin afectar los módulos activo
---

# Workflow: /new-module

## Descripción
Flujo estructurado para crear un módulo nuevo (o retomar uno en pausa como BPMN)
sobre el proyecto existente sin afectar los módulos activos.

Invocar con: `/new-module`

---

## Paso 1 — Declaración de intención

Antes de escribir cualquier código, responder estas preguntas en el chat:

```
Nombre del módulo: [ej. bpmn, crm]
Responsabilidad en una oración: [qué problema de negocio resuelve]
Colecciones de Firestore propias: [lista de colecciones nuevas que creará]
Necesita datos de HCM: [sí/no — qué datos específicamente]
Necesita datos de otro módulo: [sí/no — cuál y qué datos]
Estado inicial: [desde cero / retomar código en pausa]
```

**No avanzar al Paso 2 hasta confirmar esta declaración con el usuario.**

---

## Paso 2 — Auditoría de impacto en módulos existentes

Verificar que el módulo nuevo no colisiona con lo que ya existe:

```bash
# Verificar que el nombre del módulo no existe ya en el proyecto
grep -r "modules/[nombre-modulo]" src/
ls src/modules/

# Verificar que las colecciones nuevas no están ya en uso
grep -r "'[nombre-coleccion]'" src/firebase/
grep -r "[nombre-coleccion]" firestore.rules
grep -r "[nombre-coleccion]" firestore.indexes.json

# Si es un módulo en pausa (ej. BPMN): revisar estado del código existente
ls src/modules/bpmn/         # qué archivos quedan
ls src/app/bpmn/             # qué rutas existen
grep -r "bpmn" src/firebase/ # si hay queries o mutations mezcladas en firebase/
```

Reportar hallazgos antes de continuar:
```
"Resultado de auditoría:
 - Colisiones de nombre: [ninguna / lista]
 - Colecciones ya referenciadas: [ninguna / lista con archivo donde aparecen]
 - Código previo encontrado: [ninguno / descripción de estado]
 ¿Confirmas que proceda con la creación?"
```

---

## Paso 3 — Crear estructura base del módulo

Solo crear la estructura de carpetas y archivos vacíos con su esqueleto.
No escribir lógica de negocio todavía.

```bash
mkdir -p src/modules/[modulo]
mkdir -p src/app/[modulo]
```

Archivos a crear:

```
src/modules/[modulo]/
├── [modulo]-queries.ts       ← esqueleto vacío con comentario de responsabilidad
├── [modulo]-mutations.ts     ← esqueleto vacío con comentario de responsabilidad
├── [modulo]-utils.ts         ← esqueleto vacío con comentario de responsabilidad
├── [modulo].types.ts         ← interfaces base declaradas (sin lógica)
├── [modulo]-hcm-adapter.ts   ← SOLO si necesita datos de HCM (ver Paso 4)
└── README.md                 ← completar con plantilla obligatoria
```

Esqueleto mínimo para cada archivo de acciones:
```ts
// [modulo]-queries.ts
// MÓDULO: [NOMBRE]
// RESPONSABILIDAD: Queries de solo lectura para el módulo [nombre].
// NO contiene writes ni lógica de negocio.
// Ver: [modulo]-mutations.ts para escrituras.

import { db } from '@/firebase/provider';
// imports de firebase/firestore según necesidad

// Las funciones se añaden aquí conforme se desarrolla el módulo.
```

---

## Paso 4 — Configurar adaptador si necesita datos de HCM

Solo ejecutar este paso si en el Paso 1 se declaró que el módulo
necesita datos de HCM.

```ts
// src/modules/[modulo]/[modulo]-hcm-adapter.ts
// CONTRATO: [Módulo] necesita [qué datos] de HCM para [qué propósito].
// ACCESO: Solo lectura. No modifica datos de HCM.
// FUENTE: [archivo de queries de HCM que se consume]
// TIPO PROPIO: [NombreDelTipoPropio] definido en [modulo].types.ts

import { [funcionDeHCM] } from '@/firebase/actions/[archivo-hcm]-queries';
import type { [TipoHCM] } from '@/types/hcm.types';
import type { [TipoPropio] } from './[modulo].types';

/**
 * [Descripción de qué transforma y por qué]
 * No expone [campos sensibles que excluye] de HCM.
 */
export async function [nombreDescriptivo](): Promise<[TipoPropio][]> {
  const data = await [funcionDeHCM]();
  return data.map((item: [TipoHCM]): [TipoPropio] => ({
    // solo los campos necesarios
  }));
}
```

**Verificar que `hcm/` no fue modificado en este paso.**
Si el agente sugiere modificar algo en `src/firebase/actions/` de HCM,
detener y aplicar `no-source-modification.md`.

---

## Paso 5 — Registrar colecciones en firestore.rules

Añadir sección del módulo nuevo en `firestore.rules`.
Insertarla después de la sección HCM, antes del cierre del archivo.

```
// ============================================================
// MÓDULO: [NOMBRE EN MAYÚSCULAS]
// Colecciones: [lista]
// Permisos base: [descripción de quién puede leer/escribir]
// Accesos cruzados: [ninguno por ahora / lista si aplica]
// Última modificación: [fecha] — Creación inicial del módulo
// ============================================================

match /[coleccion]/{docId} {
  allow read: if isSignedIn() && hasModule('[modulo]_viewer');
  allow write: if isSignedIn() && hasModule('[modulo]_admin');
}
```

Si el módulo accede a colecciones de HCM (definido en Paso 1),
añadir también la regla de acceso cruzado en la sección correspondiente:

```
// ------------------------------------------------------------
// ACCESO CRUZADO: [MÓDULO NUEVO] → HCM
// Motivo: [razón declarada en Paso 1]
// Restricción: Solo lectura básica — sin acceso a compensation ni datos sensibles
// ------------------------------------------------------------
```

**Probar con tres perfiles antes de continuar:**
```
[ ] Usuario no autenticado → debe ser rechazado
[ ] Rol Member → debe ver solo lo que se definió como público
[ ] Rol Admin → debe tener acceso completo al módulo
```

---

## Paso 6 — Registrar AppModule y permisos base

```ts
// 1. Añadir a AppModule en src/types/auth.types.ts
export type AppModule =
  | 'hcm_employees'
  | 'hcm_attendance'
  // ... módulos existentes
  | '[modulo]_viewer'   // ← nuevo
  | '[modulo]_admin';   // ← nuevo

// 2. Añadir defaults en SYSTEM_ROLES (role-actions.ts)
// OBLIGATORIO para TODOS los roles, no solo Admin
// Si un rol no tiene el módulo en sus defaults, el sidebar lo oculta silenciosamente
```

---

## Paso 7 — Añadir ruta base en src/app/

Crear solo la página de entrada del módulo. Sin lógica compleja todavía.

```tsx
// src/app/[modulo]/page.tsx
// Página de entrada del módulo [nombre].
// Estado: en construcción — esqueleto inicial.

export default function [Modulo]Page() {
  return (
    <div>
      <h1>[Nombre del Módulo]</h1>
      <p>Módulo en desarrollo.</p>
    </div>
  );
}
```

Añadir ítem al sidebar en `ALL_NAV_ITEMS`:
```ts
{
  label: '[Nombre visible]',
  href: '/[modulo]',
  module: '[modulo]_viewer',   // ← usa el AppModule definido en Paso 6
  icon: [IconoCorrespondiente]
}
```

---

## Paso 8 — Completar README.md del módulo

Llenar la plantilla con la información real del módulo recién creado:

```markdown
# Módulo: [Nombre]

## Responsabilidad
[Oración del Paso 1]

## Estado
- [ ] En desarrollo activo
- [x] Esqueleto inicial creado — [fecha]

## Colecciones de Firestore
- `[coleccion]` — [descripción del contenido]

## Dependencias externas
- **HCM** — vía `[modulo]-hcm-adapter.ts` — [qué datos consume]
(o "Ninguna" si no tiene)

## Lo que este módulo NO hace
- [exclusiones para evitar asignación de responsabilidades ajenas]

## Archivos clave
- `[modulo]-queries.ts` — queries de lectura (vacío, en construcción)
- `[modulo]-mutations.ts` — operaciones de escritura (vacío, en construcción)
- `[modulo]-hcm-adapter.ts` — acceso a datos de empleados de HCM (si aplica)

## AppModule registrados
- `[modulo]_viewer` — acceso de lectura
- `[modulo]_admin` — acceso de escritura y administración
```

---

## Paso 9 — Verificación final antes de primer commit

```
[ ] src/modules/[modulo]/ existe con todos los archivos esqueleto
[ ] README.md del módulo está completo
[ ] firestore.rules tiene sección del módulo con encabezado
[ ] AppModule añadido en auth.types.ts
[ ] Defaults añadidos en SYSTEM_ROLES para todos los roles
[ ] Ítem añadido al sidebar con module correcto
[ ] Ningún archivo de HCM fue modificado durante este proceso
[ ] Ningún archivo de shared/ fue modificado salvo auth.types.ts y role-actions.ts
[ ] Build pasa sin errores de TypeScript: npm run build
[ ] Linting pasa: npm run lint
```

---

## Notas específicas para retomar BPMN

Si el módulo a crear es BPMN (que ya tiene código en pausa), ejecutar
este paso adicional antes del Paso 3:

```bash
# Inventario del estado actual de BPMN
find src -name "*bpmn*" -o -name "*workflow*" | sort
grep -r "bpmn" src/app/ --include="*.tsx" --include="*.ts"
grep -r "bpmn" src/firebase/ --include="*.ts"
grep "bpmn" firestore.rules
grep "bpmn" firestore.indexes.json
```

Reportar el inventario completo antes de cualquier acción.
El código en pausa puede estar mezclado en lugares incorrectos
(ej. lógica de BPMN dentro de archivos de HCM).
Si se encuentra código fuera de `src/modules/bpmn/`, moverlo
al módulo correcto antes de continuar con el desarrollo.