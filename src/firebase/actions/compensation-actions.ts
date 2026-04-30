'use client';

import {
    collection,
    addDoc,
    getDoc,
    doc,
    serverTimestamp
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { calculateVacationDays, calculateYearsOfService } from '@/lib/vacation-utils';
import type { Compensation, Employee } from "@/types/hcm.types";

// =========================================================================
// LOCAL HELPER FUNCTIONS (Compensation calculations)
// =========================================================================

/**
 * Calcula el factor de integración del SDI según LFT
 * SDI Factor = 1 + (prima_vacacional * dias_vacaciones / 365) + (aguinaldo / 365)
 */
function calculateSDIFactor(
    vacationDays: number,
    vacationPremium: number = 0.25,
    aguinaldoDays: number = 15
): number {
    const factor = 1 + ((vacationPremium * vacationDays) / 365) + (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000;
}

/**
 * Calcula el Salario Diario Integrado
 * SDI = Salario Diario * Factor de Integración
 */
function calculateSDI(salaryDaily: number, sdiFactor: number): number {
    return Math.round(salaryDaily * sdiFactor * 100) / 100;
}

// =========================================================================
// COMPENSATION MANAGEMENT
// =========================================================================

interface CreateCompensationPayload {
    employeeId: string;
    salaryDaily: number;
    vacationPremium?: number;
    aguinaldoDays?: number;
    savingsFundPercentage?: number;
    foodVouchersDaily?: number;
    effectiveDate: string;
    createdById: string;
}

/**
 * Creates a new compensation record with automatic SDI calculation
 */
export async function createCompensation(
    payload: CreateCompensationPayload
): Promise<{ success: boolean; compensationId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get employee to calculate years of service
        const employeeRef = doc(firestore, 'employees', payload.employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;
        const yearsOfService = calculateYearsOfService(employee.hireDate);

        // Calculate vacation days based on seniority
        const vacationDays = calculateVacationDays(yearsOfService);
        const vacationPremium = payload.vacationPremium ?? 0.25; // 25% minimum
        const aguinaldoDays = payload.aguinaldoDays ?? 15; // 15 days minimum

        // Calculate SDI factor and SDI
        const sdiFactor = calculateSDIFactor(vacationDays, vacationPremium, aguinaldoDays);
        const sdiBase = calculateSDI(payload.salaryDaily, sdiFactor);

        const compensationData: Omit<Compensation, 'id'> = {
            employeeId: payload.employeeId,
            salaryDaily: payload.salaryDaily,
            salaryMonthly: Math.round(payload.salaryDaily * 30.4 * 100) / 100,
            sdiBase,
            sdiFactor,
            vacationDays,
            vacationPremium,
            aguinaldoDays,
            savingsFundPercentage: payload.savingsFundPercentage,
            foodVouchersDaily: payload.foodVouchersDaily,
            effectiveDate: payload.effectiveDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdById: payload.createdById
        };

        const compensationRef = collection(firestore, 'compensation');
        const docRef = await addDoc(compensationRef, compensationData);

        console.log(`[HCM] Created compensation record ${docRef.id} for employee ${payload.employeeId}`);
        return { success: true, compensationId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating compensation:', error);
        return { success: false, error: 'No se pudo crear el registro de compensación.' };
    }
}
