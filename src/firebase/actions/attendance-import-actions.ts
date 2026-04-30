'use client';

/**
 * attendance-import-actions.ts
 *
 * Importación masiva de asistencia desde ZKTeco y detección de incidencias automáticas.
 * Refactorizado en múltiples submódulos para mantenibilidad:
 * - import-types.ts: Contexto y tipos compartidos.
 * - import-prefetch.ts: Pre-carga de datos (empleados, turnos, incidencias previas).
 * - import-processor.ts: Procesamiento por fila (cálculo de horas, infracciones).
 * - import-notifications.ts: Tareas de justificación y notificaciones.
 */

import { addDoc, collection, DocumentReference, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { notifyRole } from './notification-actions';

import type {
    AttendanceImportRow,
    ProcessAttendanceResult,
    OvertimeMode,
    AttendanceImportContext
} from './attendance-import/import-types';

import { preFetchImportData } from './attendance-import/import-prefetch';
import { processImportRow } from './attendance-import/import-processor';
import { postProcessImport } from './attendance-import/import-notifications';

export type { OvertimeMode };

// Evita ejecuciones concurrentes por doble clic en la UI
let isProcessingImport = false;

export async function processAttendanceImport(
    rows: AttendanceImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string,
    options?: { overtimeMode?: OvertimeMode }
): Promise<ProcessAttendanceResult> {
    if (isProcessingImport) {
        return {
            success: false,
            errors: [{ row: 0, message: 'Ya hay una importación en curso. Por favor espere a que termine el proceso actual.' }]
        };
    }

    isProcessingImport = true;
    const overtimeMode: OvertimeMode = options?.overtimeMode ?? 'daily_limit';

    try {
        const { firestore } = initializeFirebase();
        // nowISO: timestamp de referencia compartido a través del AttendanceImportContext.
        // Necesario como string (no Timestamp de Firestore) porque se inyecta en
        // múltiples subdocumentos de asistencia durante el proceso batch.
        // Pattern B — NO migrar a serverTimestamp().
        const nowISO = new Date().toISOString();

        // Determinar minDate y maxDate
        let minDate = rows.length > 0 ? rows[0].date : '';
        let maxDate = rows.length > 0 ? rows[0].date : '';

        for (const r of rows) {
            if (r.date < minDate) minDate = r.date;
            if (r.date > maxDate) maxDate = r.date;
        }

        // Crear el documento del batch
        const batchRef = collection(firestore, 'attendance_imports');
        const batchData = {
            filename,
            fileSize: 0,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            uploadedById,
            uploadedByName,
            uploadedAt: serverTimestamp(), // Pattern A — campo de auditoría top-level del documento batch
            recordCount: rows.length,
            successCount: 0,
            skippedCount: 0,
            errorCount: 0,
            status: 'processing',
            errors: [],
            overtimeMode
        };

        const batchDocRef = await addDoc(batchRef, batchData);
        const batchId = batchDocRef.id;

        // Inicializar el contexto compartido (AttendanceImportContext)
        const context: AttendanceImportContext = {
            firestore,
            now: nowISO,
            batchId,
            filename,
            uploadedById,
            uploadedByName,
            overtimeMode,
            minDate,
            maxDate,
            
            // Contadores y resultados
            successCount: 0,
            skippedCount: 0,
            errors: [],
            newRecordsToJustify: [],
            
            // Mapas y cachés
            existingRecordsMap: new Set(),
            existingTardinessMap: new Set(),
            existingDeparturesMap: new Set(),
            existingIncidencesAutoMap: new Set(),
            
            employeeShifts: {},
            employeeTimeBankBalances: {},
            employeeAssignments: {},
            
            shiftCache: {},
            locationCache: {},
            positionCache: {},
            
            officialHolidayDates: {},
            locationBenefitDatesMap: {},
            approvedIncidencesMap: {},
            weeklyOvertimeAccum: {}
        };

        // Paso 1: Pre-fetch de datos necesarios
        await preFetchImportData(rows, context);

        // Sort rows by employeeId then by date (chronological) para la acumulación semanal correcta
        const sortedRows = [...rows].sort((a, b) => {
            if (a.employeeId !== b.employeeId) return a.employeeId.localeCompare(b.employeeId);
            return a.date.localeCompare(b.date);
        });

        // Paso 2: Procesar fila por fila
        for (let i = 0; i < sortedRows.length; i++) {
            await processImportRow(sortedRows[i], i, context);
        }

        // Paso 3: Post-procesamiento y notificaciones
        await postProcessImport(context, batchDocRef, sortedRows);

        // Notificar HR Managers sobre el fin del proceso general
        await notifyRole(firestore, 'HRManager', {
            title: 'Carga de Asistencia Completada',
            message: `Se procesó el archivo ${filename}: ${context.successCount} registros exitosos, ${context.errors.length} errores.`,
            type: context.errors.length > 0 ? 'warning' : 'success',
            link: '/hcm'
        });

        return {
            success: true,
            batchId,
            recordCount: rows.length,
            successCount: context.successCount,
            skippedCount: context.skippedCount,
            errorCount: context.errors.length,
            errors: context.errors
        };
    } catch (error) {
        console.error('[HCM] Error processing attendance import:', error);
        return { success: false, errors: [{ row: 0, message: 'Error general en la importación' }] };
    } finally {
        isProcessingImport = false;
    }
}
