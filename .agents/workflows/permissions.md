---
description: Reglas obligatorias al crear o modificar páginas/componentes que usan permisos o acceden a colecciones protegidas de Firestore
---

# /permissions — Checklist de Permisos

Seguir **SIEMPRE** al crear o modificar cualquier página, componente o acción que involucre:
- Acceso a colecciones protegidas (`employees`, `incidences`, `vacation_balances`, `attendance`, `compensation`, `tasks`)
- Visibilidad de UI basada en rol

---

## 1. NUNCA usar checks hardcodeados de rol

```tsx
// ❌ PROHIBIDO
const canCreate = user?.role === 'Admin' || user?.role === 'Designer';
const hasHRPermissions = user?.role === 'Admin';

// ✅ CORRECTO
import { usePermissions } from '@/hooks/use-permissions';
const { canRead, canWrite, isAdmin } = usePermissions();
const canCreate = isAdmin || canWrite('templates');
const hasHRPermissions = isAdmin || canRead('hcm_employees');
```

**¿Por qué?** El admin puede customizar permisos de cualquier rol sistema en la UI de Roles y Permisos. Si hardcodeas `user?.role === 'Admin'`, ignoras esas customizaciones.

## 2. Guardar queries a colecciones protegidas detrás de un check de permisos

```tsx
// ❌ PROHIBIDO — Members obtendrán "Missing or insufficient permissions"
const employeesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'employees'), where('status', '==', 'active'));
}, [firestore]);

// ✅ CORRECTO — retorna null si no tiene permisos
const employeesQuery = useMemoFirebase(() => {
    if (!firestore || !hasHRPermissions) return null;
    return query(collection(firestore, 'employees'), where('status', '==', 'active'));
}, [firestore, hasHRPermissions]);
```

## 3. Guardar llamadas a `hasDirectReports` / `getDirectReports`

Estas funciones hacen `list` sobre `employees`. Solo ejecutarlas para roles con permiso:

```tsx
// ❌ PROHIBIDO
useEffect(() => {
    if (user?.uid) hasDirectReports(user.uid).then(setIsManager);
}, [user]);

// ✅ CORRECTO
useEffect(() => {
    const canCheck = user?.role && ['Manager', 'HRManager', 'Admin'].includes(user.role);
    if (user?.uid && canCheck) {
        hasDirectReports(user.uid).then(setIsManager);
    }
}, [user]);
```

## 4. Firestore Rules — nuevos tipos de task

Si creas un nuevo tipo de task (ej: `overtime_review`), agregar el tipo al array en la regla de `/tasks` en `firestore.rules`:

```
allow create: if isSignedIn()
    && request.auth.uid == request.resource.data.requestOwnerId
    && request.resource.data.type in ['incidence_approval', 'justification', 'tardiness_review', 'departure_review', 'overtime_review', 'NUEVO_TIPO_AQUI'];
```

## 5. Sidebar — módulos nuevos

Al agregar un módulo nuevo al sidebar (`ALL_NAV_ITEMS` en `site-layout.tsx`):
1. Definir un `module: AppModule` para el nuevo ítem
2. Agregar permisos default en `SYSTEM_ROLES` de `role-actions.ts` para TODOS los roles
3. El sidebar filtrará automáticamente vía `canRead(item.module)`

## 6. `getUserPermissions()` — flujo de resolución

```
1. ¿Tiene customRoleId? → Buscar en Firestore /roles/{customRoleId}
2. ¿Es rol sistema? → Buscar override en Firestore /roles/{role.toLowerCase()}
3. ¿Tiene override en Firestore? → Usar esos permisos
4. ¿No? → Usar defaults de SYSTEM_ROLES
5. ¿No es ninguno? → Caer a SYSTEM_ROLES.Member
```
