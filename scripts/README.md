# 🧪 Scripts de Prueba

## Scripts Disponibles

### 1. `test-location-configs.ts` ⭐ **NUEVO**
**Propósito:** Prueba integral de configuraciones dinámicas de ubicación

**Ejecutar:**
```bash
npx tsx scripts/test-location-configs.ts
```

**Qué prueba:**
- ✅ **Fase 1:** Tolerancia de retardo dinámica (5 min vs 15 min)
- ⚠️ **Fase 2:** Reinicio de horas extras (domingo vs sábado vs custom)
- ✅ **Fase 3:** Días de beneficio empresa (no genera infracciones)

**Características:**
- Limpia datos de prueba anteriores automáticamente
- Crea ubicaciones y empleados de prueba
- Genera registros de asistencia con diferentes escenarios
- Verifica automáticamente resultados de Fase 1 y 3
- Fase 2 requiere verificación manual en UI

---

### 2. `seed-database.ts`
**Propósito:** Poblar emulador con datos demo completos

**Ejecutar:**
```bash
npx tsx scripts/seed-database.ts
```

**Qué crea:**
- Roles y permisos
- Ubicaciones
- Departamentos
- Puestos
- Turnos
- Usuarios y empleados con jerarquía
- Templates de workflows

---

### 3. `test-infraction-detection.ts`
**Propósito:** Prueba básica de detección de infracciones

**Ejecutar:**
```bash
npx tsx scripts/test-infraction-detection.ts
```

**Qué prueba:**
- Detección de retardos
- Detección de salidas tempranas
- Asistencia normal (sin infracciones)

---

## Flujo Recomendado

### Para Desarrollo Normal:
```bash
# 1. Poblar base de datos
npx tsx scripts/seed-database.ts

# 2. Iniciar emuladores
firebase emulators:start

# 3. Iniciar frontend
npm run dev
```

### Para Probar Configuraciones Dinámicas:
```bash
# 1. Asegurar que emuladores estén corriendo
firebase emulators:start

# 2. Ejecutar pruebas
npx tsx scripts/test-location-configs.ts

# 3. Verificar resultados en consola y UI
```

---

## Notas Importantes

- **Emuladores:** Todos los scripts requieren que los emuladores estén corriendo
- **Limpieza:** `test-location-configs.ts` limpia sus propios datos automáticamente
- **Datos Persistentes:** Los datos de prueba permanecen en el emulador para inspección
- **Re-ejecución:** Puedes ejecutar `test-location-configs.ts` múltiples veces

---

## Troubleshooting

### Error: "Connection refused"
- Verifica que los emuladores estén corriendo: `firebase emulators:start`
- Verifica los puertos: Firestore (8080), Auth (9099)

### Error: "Module not found"
- Ejecuta: `npm install`
- Verifica que `tsx` esté instalado: `npm install -g tsx`

### Las pruebas fallan
- Revisa los logs de Cloud Functions en la consola del emulador
- Verifica que las funciones estén desplegadas: `npm run build` en `/functions`
