import { doc, getDoc, collection, addDoc, DocumentReference } from 'firebase/firestore';
import type { Employee, TardinessRecord, EarlyDeparture } from "@/types/hcm.types";
import { batchAutoJustify } from '../auto-justification-actions';
import { createNotification, notifyRole } from '../notification-actions';
import { updateDocumentNonBlocking } from '../../non-blocking-updates';
import type { AttendanceImportContext } from './import-types';

export async function resolveEscalatedManager(firestore: any, startManagerId: string): Promise<string | null> {
    let currentManagerId = startManagerId;
    const visited = new Set<string>();

    while (currentManagerId && !visited.has(currentManagerId)) {
        visited.add(currentManagerId);

        try {
            const empRef = doc(firestore, 'employees', currentManagerId);
            const empSnap = await getDoc(empRef);

            if (!empSnap.exists()) return null;

            const empData = empSnap.data() as Employee;

            if (empData.positionId) {
                const posRef = doc(firestore, 'positions', empData.positionId);
                const posSnap = await getDoc(posRef);

                if (posSnap.exists()) {
                    const position = posSnap.data();
                    if (position.canApproveIncidences) {
                        return empData.userId || currentManagerId;
                    }
                }
            }

            if (empData.directManagerId) {
                console.log(`[HCM] Manager ${currentManagerId} lacks permission, escalating to ${empData.directManagerId}`);
                currentManagerId = empData.directManagerId;
            } else {
                return null;
            }

        } catch (e) {
            console.error(`[HCM] Error resolving manager escalation for ${currentManagerId}`, e);
            return null;
        }
    }

    return null;
}

export async function groupRecordsByManager(
    firestore: any,
    records: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }>
): Promise<Record<string, Array<{ id: string; employeeId: string; employeeName: string; date: string; type: 'tardiness' | 'early_departure'; minutesLate?: number; minutesEarly?: number }>>> {
    const byManager: Record<string, Array<any>> = {};

    for (const record of records) {
        try {
            const empRef = doc(firestore, 'employees', record.employeeId);
            const empSnap = await getDoc(empRef);

            if (empSnap.exists()) {
                const emp = empSnap.data() as Employee;
                const directManagerId = emp.directManagerId;

                if (directManagerId) {
                    const targetManagerUserId = await resolveEscalatedManager(firestore, directManagerId);

                    if (targetManagerUserId) {
                        let minutesLate: number | undefined;
                        let minutesEarly: number | undefined;

                        if (record.type === 'tardiness') {
                            const tardinessRef = doc(firestore, 'tardiness_records', record.id);
                            const tardinessSnap = await getDoc(tardinessRef);
                            if (tardinessSnap.exists()) {
                                minutesLate = (tardinessSnap.data() as TardinessRecord).minutesLate;
                            }
                        } else {
                            const departureRef = doc(firestore, 'early_departures', record.id);
                            const departureSnap = await getDoc(departureRef);
                            if (departureSnap.exists()) {
                                minutesEarly = (departureSnap.data() as EarlyDeparture).minutesEarly;
                            }
                        }

                        if (!byManager[targetManagerUserId]) {
                            byManager[targetManagerUserId] = [];
                        }
                        byManager[targetManagerUserId].push({
                            ...record,
                            employeeName: emp.fullName || record.employeeId,
                            minutesLate,
                            minutesEarly
                        });
                    } else {
                        console.warn(`[HCM] Could not find a manager with permissions for employee ${record.employeeId}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[HCM] Error grouping record ${record.id}:`, error);
        }
    }

    return byManager;
}

export async function createJustificationTask(
    firestore: any,
    managerId: string,
    records: Array<{ id: string; employeeId: string; employeeName: string; date: string; type: 'tardiness' | 'early_departure'; minutesLate?: number; minutesEarly?: number }>,
    metadata: { batchId: string; filename: string; uploadedBy: string }
): Promise<void> {
    try {
        const now = new Date().toISOString();

        const uniqueEmployees = [...new Set(records.map(r => r.employeeName))];
        const tardinessCount = records.filter(r => r.type === 'tardiness').length;
        const departureCount = records.filter(r => r.type === 'early_departure').length;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 2);

        const taskData = {
            name: `Justificar Incidencias de Asistencia`,
            description: `Se detectaron ${records.length} incidencias que requieren justificación:\n- ${tardinessCount} retardo${tardinessCount !== 1 ? 's' : ''}\n- ${departureCount} salida${departureCount !== 1 ? 's' : ''} temprana${departureCount !== 1 ? 's' : ''}\n\nEmpleados afectados: ${uniqueEmployees.join(', ')}`,
            type: 'attendance_justification',
            status: 'Active',
            priority: 'high',
            assigneeId: managerId,
            requestTitle: `Justificar Incidencias - ${metadata.filename}`,
            requestId: 'SYSTEM_GENERATED',
            requestOwnerId: metadata.uploadedBy,
            createdBy: metadata.uploadedBy,
            createdAt: now,
            dueDate: dueDate.toISOString(),
            metadata: {
                batchId: metadata.batchId,
                filename: metadata.filename,
                records: records.map(r => ({
                    id: r.id,
                    employeeId: r.employeeId,
                    employeeName: r.employeeName,
                    date: r.date,
                    type: r.type,
                    minutesLate: r.minutesLate ?? null,
                    minutesEarly: r.minutesEarly ?? null
                }))
            },
            module: 'hcm_team_management',
            link: `/tasks`
        };

        await addDoc(collection(firestore, 'tasks'), taskData);

        await createNotification(firestore, managerId, {
            title: 'Nuevas Incidencias de Asistencia',
            message: `Tienes ${records.length} incidencia${records.length !== 1 ? 's' : ''} pendiente${records.length !== 1 ? 's' : ''} de justificación de tu equipo.`,
            type: 'warning',
            link: `/tasks`
        });

        console.log(`[HCM] Created justification task for manager ${managerId} with ${records.length} records`);
    } catch (error) {
        console.error('[HCM] Error creating justification task:', error);
    }
}

export async function postProcessImport(
    context: AttendanceImportContext,
    batchDocRef: DocumentReference,
    rows: any[]
): Promise<void> {
    const {
        firestore,
        batchId,
        filename,
        uploadedById,
        successCount,
        skippedCount,
        errors,
        newRecordsToJustify
    } = context;

    const finalStatus = errors.length === 0 ? 'completed' :
        successCount === 0 ? 'failed' : 'partial';

    updateDocumentNonBlocking(batchDocRef, {
        status: finalStatus,
        successCount,
        skippedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
        dateRangeStart: rows.length > 0 ? rows.reduce((min: string, r: any) => r.date < min ? r.date : min, rows[0].date) : undefined,
        dateRangeEnd: rows.length > 0 ? rows.reduce((max: string, r: any) => r.date > max ? r.date : max, rows[0].date) : undefined
    });

    console.log(`[HCM] Processed attendance import: ${successCount} success, ${errors.length} errors`);

    // Auto-justify detected issues
    if (newRecordsToJustify.length > 0) {
        await batchAutoJustify(newRecordsToJustify);

        try {
            const recordsByManager = await groupRecordsByManager(firestore, newRecordsToJustify);

            for (const [managerId, records] of Object.entries(recordsByManager)) {
                await createJustificationTask(firestore, managerId, records, {
                    batchId,
                    filename,
                    uploadedBy: uploadedById
                });
            }

            console.log(`[HCM] Created justification tasks for ${Object.keys(recordsByManager).length} managers`);
        } catch (error) {
            console.error('[HCM] Error creating manager tasks:', error);
        }
    }

    // Notify HR Managers
    await notifyRole(firestore, 'HRManager', {
        title: 'Carga de Asistencia Completada',
        message: `Se procesó el archivo ${filename}: ${successCount} registros exitosos, ${errors.length} errores.`,
        type: errors.length > 0 ? 'warning' : 'success',
        link: '/hcm'
    });
}
