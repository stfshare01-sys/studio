# Studio — Sistema Integral de Gestión Organizacional

Plataforma web interna construida con **Next.js 15 + Firebase** para la gestión de capital humano, documentos organizacionales y procesos internos de **Stuffactory, S.A. de C.V.**

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| Base de datos | Cloud Firestore |
| Almacenamiento | Firebase Storage |
| Autenticación | Firebase Auth |
| Backend serverless | Cloud Functions (Node.js 20) |
| Hosting | Firebase App Hosting |
| Lenguaje | TypeScript (strict) |

---

## Módulos activos

### HCM — Capital Humano
Control de asistencia, nómina, incidencias, vacaciones y estructura organizacional.

- Empleados, departamentos, puestos, turnos y ubicaciones
- Importación de marcajes desde sistema externo (checador)
- Incidencias: vacaciones, home office, permisos, horas extra, retardos, salidas tempranas
- Home Office cuenta como asistencia (`ASI`) en Nomipaq; requiere check-in y check-out desde el sistema
- Pre-nómina con bloqueo de períodos y exportación contable
- Bolsa de horas y banco de vacaciones
- Reportes de asistencia por período

**Rutas:** `/hcm/*`  
**Colecciones Firestore:** `employees`, `attendance`, `incidences`, `prenomina`, `vacation_balances`, `tardiness_records`, `early_departures`, `missing_punches`, `hourBanks`, `departments`, `positions`, `locations`, `shifts`, `compensation`

---

### Biblioteca — Documentos Organizacionales
Repositorio centralizado de políticas, manuales, procedimientos y formatos con control de acceso por departamento o usuario.

- Subida de archivos PDF y Word (máx. 50 MB)
- Categorías: Política, Manual, Procedimiento, Formato, Otro
- Control de visibilidad aditivo: toda la empresa, por departamento o por usuario específico
- Previsualización de PDF en navegador; descarga directa de Word
- **Biblioteca AI (Bot RAG)**: Asistente que responde dudas sobre el contenido de los documentos usando Gemini y búsqueda semántica (Vector Search), respetando estrictamente los permisos de acceso del usuario.

**Ruta:** `/biblioteca`  
**Colecciones Firestore:** `org_documents`, `doc_chunks`
**Storage:** `org_documents/{timestamp}_{filename}`

---

## Módulos planificados

| Módulo | Estado | Descripción |
|---|---|---|
| BPMN | En pausa | Motor de procesos internos con diagramas de flujo |
| CRM | Futuro | Gestión de clientes y oportunidades comerciales |

---

## Estructura del proyecto

```
studio/
├── src/
│   ├── app/                    → Rutas Next.js (App Router)
│   │   ├── hcm/               → Módulo Capital Humano
│   │   └── biblioteca/        → Módulo Documentos Organizacionales
│   ├── firebase/
│   │   ├── actions/           → Queries y mutations por dominio (HCM legacy)
│   │   ├── provider.tsx       → FirebaseProvider — useFirestore, useStorage, useUser
│   │   └── role-actions.ts    → SYSTEM_ROLES, MODULE_INFO, permisos por módulo
│   ├── modules/
│   │   └── documents/         → Módulo Biblioteca (queries, mutations, types, README)
│   ├── hooks/
│   │   └── use-permissions.ts → Hook central de permisos por módulo y rol
│   ├── components/
│   │   └── site-layout.tsx    → Layout con sidebar de navegación
│   └── types/
│       ├── core.ts            → AppModule, tipos compartidos
│       └── hcm.types.ts       → Tipos del módulo HCM
├── functions/                 → Cloud Functions
├── firestore.rules            → Reglas de seguridad Firestore
├── storage.rules              → Reglas de seguridad Storage
├── firestore.indexes.json     → Índices compuestos
├── firebase.json              → Configuración de servicios Firebase
└── apphosting.yaml            → Configuración de Firebase App Hosting
```

---

## Sistema de permisos

Los permisos se controlan en `src/firebase/role-actions.ts` mediante `SYSTEM_ROLES`.  
Cada módulo tiene un nivel por rol: `hidden` | `read` | `write`.

| Rol | Descripción |
|---|---|
| Admin | Acceso total a todos los módulos |
| HRManager | Gestión completa de HCM y Biblioteca |
| Manager | Lectura de su equipo + aprobaciones |
| Member | Acceso de lectura a documentos y su propia información |
| Designer | Acceso de lectura básico |

Para añadir un módulo nuevo → ver `.agents/workflows/new-module.md`

---

## Comandos de desarrollo

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Build de producción
npm run build

# Desplegar a Firebase (reglas + hosting)
firebase deploy

# Solo reglas de Firestore
firebase deploy --only firestore:rules

# Solo Storage
firebase deploy --only storage

# Emuladores locales
firebase emulators:start
```

---

## Guías de arquitectura

Las reglas y workflows del agente de IA están en `.agents/rules/` y `.agents/workflows/`.  
Antes de añadir cualquier feature, consultar:

- `module-boundaries.md` — Cómo estructurar módulos y sus dependencias
- `search-before-write.md` — Prevenir duplicación de código
- `no-source-modification.md` — Usar adaptadores en lugar de modificar código existente
- `firebase-scale.md` — Firestore rules, indexes y seguridad por módulo
