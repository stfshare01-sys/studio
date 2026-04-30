import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where } from 'firebase/firestore';

import { useToast } from '@/hooks/use-toast';
import { useFirebase, useMemoFirebase, initializeFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { createEmployee } from '@/firebase/actions/employee-actions';
import { createNewUser } from '@/firebase/admin-actions';

import { employeeSchema, type EmployeeFormValues } from '../employee-schema';
import type { Department, Position, CustomShift, Employee, Location } from "@/types/hcm.types";

export function useNewEmployee() {
    const router = useRouter();
    const { toast } = useToast();
    const { firestore, isUserLoading } = useFirebase();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Departments
    const departmentsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'departments'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);
    const { data: departments, isLoading: isLoadingDepts } = useCollection<Department>(departmentsQuery);

    // Fetch Positions
    const positionsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'positions'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);
    const { data: positions, isLoading: isLoadingPositions } = useCollection<Position>(positionsQuery);

    // Fetch Shifts
    const shiftsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'shifts'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);
    const { data: shifts, isLoading: isLoadingShifts } = useCollection<CustomShift>(shiftsQuery);

    // Fetch Locations
    const locationsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'locations'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);
    const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsQuery);

    // Fetch Managers
    const managersQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'employees'), where('status', '==', 'active'));
    }, [firestore, isUserLoading]);
    const { data: managers, isLoading: isLoadingManagers } = useCollection<Employee>(managersQuery);

    const form = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema),
        defaultValues: {
            fullName: '',
            email: '',
            positionId: '',
            employmentType: 'full_time',
            shiftId: '',
            locationId: '',
            managerId: '',
            rfc: '',
            curp: '',
            nss: '',
            allowTimeForTime: false,
            employeeId: '',
            legalEntity: '',
            homeOfficeDays: [],
            workMode: 'office' as const,
        },
    });

    // Auto-fill department based on selected position
    const selectedPositionId = form.watch('positionId');
    const selectedPosition = positions?.find(p => p.id === selectedPositionId);
    const autoDepartment = selectedPosition?.departmentId
        ? departments?.find(d => d.id === selectedPosition.departmentId)
        : null;

    async function onSubmit(data: EmployeeFormValues) {
        setIsSubmitting(true);
        try {
            const selectedPos = positions?.find(p => p.id === data.positionId);
            const selectedDept = selectedPos?.departmentId
                ? departments?.find(d => d.id === selectedPos.departmentId)
                : null;
            const selectedShift = shifts?.find(s => s.id === data.shiftId);

            // 1. Create System User First
            let userId = '';
            try {
                const userResult = await createNewUser({
                    fullName: data.fullName,
                    email: data.email,
                    department: selectedDept?.name || selectedPos?.department || '',
                    role: 'Member'
                });

                if (userResult.success && userResult.uid) {
                    userId = userResult.uid;
                } else {
                    throw new Error("No se pudo crear el usuario del sistema.");
                }
            } catch (userError) {
                console.error("Error creating system user:", userError);
                throw new Error("Error al crear la cuenta de usuario: " + (userError as Error).message);
            }

            // 2. Upload avatar if exists
            let avatarUrl: string | undefined = undefined;
            if (data.avatarFile) {
                try {
                    const { storage } = initializeFirebase();
                    const avatarRef = ref(storage, `employees/${userId}/avatar`);
                    await uploadBytes(avatarRef, data.avatarFile);
                    avatarUrl = await getDownloadURL(avatarRef);
                } catch (uploadError) {
                    console.error("Error subiendo foto de perfil:", uploadError);
                    toast({
                        title: "Aviso",
                        description: "El empleado se creó en sistema, pero no se pudo subir la foto.",
                    });
                }
            }

            // 3. Create Employee Record
            const result = await createEmployee(userId, {
                fullName: data.fullName,
                email: data.email,
                department: selectedDept?.name || selectedPos?.department || '',
                departmentId: selectedPos?.departmentId || '',
                positionId: data.positionId,
                positionTitle: selectedPos?.name || data.positionId,
                employmentType: data.employmentType,
                shiftType: selectedShift?.type || 'diurnal',
                shiftId: data.shiftId,
                locationId: data.locationId,
                hireDate: data.hireDate instanceof Date
                    ? data.hireDate.toISOString().split('T')[0]
                    : String(data.hireDate).split('T')[0],
                managerId: data.managerId || undefined,
                rfc: data.rfc || undefined,
                curp: data.curp || undefined,
                nss: data.nss || undefined,
                allowTimeForTime: data.allowTimeForTime || false,
                employeeId: data.employeeId || undefined,
                legalEntity: data.legalEntity || undefined,
                avatarUrl: avatarUrl,
                homeOfficeDays: data.homeOfficeDays || [],
                workMode: data.workMode || 'office',
            });

            if (result.success) {
                toast({
                    title: "Empleado creado",
                    description: "El empleado ha sido registrado exitosamente.",
                });
                router.push('/hcm/employees');
            } else {
                toast({
                    title: "Error",
                    description: result.error || "No se pudo crear el empleado.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const isLoadingCatalogs = isLoadingDepts || isLoadingPositions || isLoadingShifts || isLoadingLocations || isLoadingManagers;

    return {
        form,
        isSubmitting,
        isLoadingCatalogs,
        onSubmit,
        catalogs: {
            departments,
            positions,
            shifts,
            locations,
            managers
        },
        autoDepartment
    };
}
