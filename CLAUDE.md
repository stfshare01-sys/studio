# Principios de Codigo Limpio y Anti-Fragilidad

Seguir **SIEMPRE** estas practicas al momento de corregir bugs, agregar nuevas funciones o refactorizar codigo para evitar romper funcionalidades existentes:

## 1. Principio de Abierto/Cerrado (OCP - Open/Closed Principle)

El codigo debe estar **abierto para la extension pero cerrado para la modificacion**.

- **Regla:** Si necesitas agregar una nueva funcionalidad, hazlo escribiendo codigo nuevo (nuevos componentes, modulos, utilidades o funciones) en lugar de modificar funciones complejas que ya operan correctamente.
- **Practica:** Utiliza abstracciones (interfaces, hooks genericos, componentes base) permitiendo que el sistema crezca sin alterar su nucleo vital.

## 2. Principio de Responsabilidad Unica (SRP) y Bajo Acoplamiento

Una clase, componente o funcion debe hacer **una sola cosa** y tener un unico motivo para cambiar.

- **Regla:** Evita componentes "Dios" (God objects) o funciones de configuracion masivas. Dividelas logicamente.
- **Practica:** Disena el software con alta cohesion y bajo acoplamiento. Si modificas la logica de UI, la logica de datos no deberia verse afectada y viceversa. Un cambio en una parte no debe propagarse de forma no deseada a otra.

## 3. Pruebas y Validacion (Red de Seguridad)

La "red de seguridad" principal contra las modificaciones destructivas es el soporte automatizado.

- **Pruebas unitarias:** Valida el comportamiento esperado de cada modulo de forma aislada.
- **Deteccion Inmediata:** Si una correccion rompe una funcion del pasado, tu prueba deberia avisarte antes de que el codigo pase a produccion.
- **Validacion manual:** Si no existen pruebas formales, prueba de manera manual pero exhaustiva las areas colaterales a la funcion editada.
- **Type-check:** Siempre ejecutar `npx tsc --noEmit` despues de cambios para detectar errores de tipo.

## 4. Integracion Continua (CI)

- **Regla:** Apoyate en las integraciones (GitHub Actions, etc.) para asegurar que cualquier modificacion pase siempre un flujo estandarizado (TypeScript compiler, Linting, Build test).
- **Practica:** Nunca obvies los errores de linter o compilacion. Resuelvelos de forma temprana para asegurar la correcta integracion del codigo.

## 5. Refactorizacion Regular (Cero Parches Rapidos)

- **Regla:** No acumules deuda tecnica. En lugar de poner "parches" rapidos a los errores (`if (bug) fix()`), entiende el problema raiz.
- **Practica:** Mejora continuamente la estructura interna sin cambiar su comportamiento externo. Si descubres que una funcion fue mal disenada, tomate el tiempo para desacoplarla de manera limpia antes de agregarle mas logica encima.

## 6. Consistencia de Datos (Firestore)

Reglas especificas para este proyecto Firebase/Firestore:

- **Case Sensitivity:** Firestore es case-sensitive. SIEMPRE verificar que los valores de status, types, y roles sean consistentes entre creacion, queries y actualizacion (ej: `'pending'` vs `'Pending'`).
- **Indices Compuestos:** Toda query con multiples `where()` sobre campos diferentes requiere un indice compuesto. SIEMPRE verificar que el indice existe en `firestore.indexes.json` antes de escribir la query.
- **Campos Anidados:** Firestore NO indexa automaticamente campos dentro de Maps (ej: `metadata.incidenceId`). Usar campos de nivel superior para queries o crear indices explicitos.
- **Timezone Dates:** Al guardar fechas tipo `YYYY-MM-DD`, NUNCA usar `.toISOString()` completo (genera hora UTC que causa desfase -1 dia en zonas horarias negativas). Usar `.toISOString().split('T')[0]` o almacenar directamente el string de fecha.

## 7. Analisis de Impacto Antes de Cada Cambio

- **Regla:** Antes de modificar cualquier funcion, busca TODOS los archivos que la importan o la usan. Verifica que tu cambio no rompa ninguno.
- **Practica:** Usa `grep` para buscar todas las referencias a la funcion/componente/variable que vas a cambiar. Si hay mas de 3 consumidores, considera crear una funcion NUEVA en vez de modificar la existente.

## 8. Reglas de Firestore (Security Rules)

- **Additividad:** Las reglas de Firestore son ADITIVAS. Si CUALQUIER `allow` coincide, la operacion se permite. Nunca uses `allow write` (que incluye delete) si despues quieres `allow delete: if false`.
- **Funciones Definidas:** SIEMPRE verificar que las funciones helper referenciadas en las reglas existan y esten definidas. Una funcion no definida causa permiso denegado.
- **Consistencia Roles:** Mantener sincronizados los permisos entre `SYSTEM_ROLES` (client-side) y `firestore.rules` (server-side).
- **Permisos de escritura:** Las colecciones protegidas como `vacation_balances` solo permiten escritura desde Cloud Functions (Admin SDK). NUNCA intentar escritura directa desde el cliente para colecciones protegidas — usar siempre la Cloud Function correspondiente.
