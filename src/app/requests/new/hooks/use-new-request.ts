'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { addDocumentNonBlocking, setDocumentNonBlocking, useCollection, useFirestore, useMemoFirebase, useUser, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { hasPermission } from '@/firebase/role-actions';
import { evaluateFieldVisibility, validateFieldValue } from '@/components/form-fields';
import { evaluateAndAddInitialSteps } from '@/lib/workflow-engine';
import { SYSTEM_TEMPLATES } from '@/lib/system-templates';
import { assignInitialTask } from '../utils/request-task-assignment';
import type { User } from '@/types/auth.types';
import type { Template, FormField } from "@/types/workflow.types";
import type { Employee } from "@/types/hcm.types";

const ALLOWED_FILE_TYPES = [
    'image/jpeg', 'image/png', 'image/gif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function useNewRequest() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const storage = useStorage();
    const firestore = useFirestore();
    const { permissions, isAdmin } = usePermissions();

    const templateId = searchParams.get('templateId');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(templateId || undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState<Record<string, any>>({});
    const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});

    // On behalf of state
    const [requestOnBehalfOf, setRequestOnBehalfOf] = useState<string>('');
    const [userSelectorOpen, setUserSelectorOpen] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    // Data fetching
    const templatesRef = useMemoFirebase(() => collection(firestore, 'request_templates'), [firestore]);
    const { data: firestoreTemplates } = useCollection<Template>(templatesRef);

    const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users } = useCollection<User>(usersQuery);

    const employeesQuery = useMemoFirebase(() => collection(firestore, 'employees'), [firestore]);
    const { data: employees } = useCollection<Employee>(employeesQuery);

    // Default to current user
    useEffect(() => {
        if (user && !requestOnBehalfOf) {
            setRequestOnBehalfOf(user.uid);
        }
    }, [user, requestOnBehalfOf]);

    // Merge Firestore + System templates, only published
    const allTemplates = useMemo(() => {
        const dbTemplates = firestoreTemplates || [];
        const merged = [...dbTemplates];
        SYSTEM_TEMPLATES.forEach(sysTpl => {
            if (!merged.find(t => t.id === sysTpl.id)) merged.push(sysTpl);
        });
        return merged.filter(t => !t.status || t.status === 'published');
    }, [firestoreTemplates]);

    // Current user profile for permission checking
    const currentUserProfile = useMemo(() => users?.find(u => u.id === user?.uid), [users, user]);

    const canUserInitiate = useCallback((template: Template): boolean => {
        if (!template.initiatorPermissions) return true;
        const perms = template.initiatorPermissions;
        if (perms.type === 'all') return true;
        if (perms.type === 'user' && perms.userIds) return perms.userIds.includes(user?.uid || '');
        if (perms.type === 'role' && perms.roleIds && currentUserProfile?.role) return perms.roleIds.includes(currentUserProfile.role);
        if (perms.type === 'position' && perms.positionIds) return true;
        if (perms.type === 'department' && perms.departmentIds && currentUserProfile?.department) return perms.departmentIds.includes(currentUserProfile.department);
        return false;
    }, [user, currentUserProfile]);

    const templates = useMemo(() => {
        if (!allTemplates) return [];
        return allTemplates.filter(t => {
            const isPublished = t.status === 'published' || !t.status;
            return isPublished && canUserInitiate(t);
        });
    }, [allTemplates, canUserInitiate]);

    const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

    // Available subjects (who can be requested for)
    const availableSubjects = useMemo(() => {
        if (!users || !user) return [];
        const activeUsers = users.filter(u => u.status === 'active' || !u.status);

        const hasGlobalAccess = hasPermission(permissions, 'hcm_team_management_global', 'write') || isAdmin;
        if (hasGlobalAccess) return activeUsers;

        const subordinateEmployeeIds = employees
            ?.filter(emp => emp.directManagerId === user.uid)
            .map(emp => emp.id) || [];
        const mySubordinates = activeUsers.filter(u => subordinateEmployeeIds.includes(u.id));

        if (mySubordinates.length > 0) {
            const self = activeUsers.find(u => u.id === user.uid);
            return self ? [self, ...mySubordinates] : mySubordinates;
        }

        const self = activeUsers.find(u => u.id === user.uid);
        return self ? [self] : [];
    }, [users, user, permissions, isAdmin, employees]);

    const filteredSubjects = useMemo(() => {
        if (!userSearch) return availableSubjects;
        const lower = userSearch.toLowerCase();
        return availableSubjects.filter(u =>
            u.fullName.toLowerCase().includes(lower) ||
            u.email.toLowerCase().includes(lower)
        );
    }, [availableSubjects, userSearch]);

    const selectedSubject = useMemo(() => users?.find(u => u.id === requestOnBehalfOf), [users, requestOnBehalfOf]);

    // Form handlers
    const handleInputChange = useCallback((fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
        setValidationErrors(prev => ({ ...prev, [fieldId]: null }));
    }, []);

    const handleFileChange = useCallback((fieldId: string, file: File | undefined) => {
        if (!file) {
            handleInputChange(fieldId, undefined);
            setFileErrors(prev => ({ ...prev, [fieldId]: '' }));
            return;
        }
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            setFileErrors(prev => ({ ...prev, [fieldId]: 'Tipo de archivo no permitido.' }));
            handleInputChange(fieldId, undefined);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setFileErrors(prev => ({ ...prev, [fieldId]: 'El archivo excede el límite de 5MB.' }));
            handleInputChange(fieldId, undefined);
            return;
        }
        setFileErrors(prev => ({ ...prev, [fieldId]: '' }));
        handleInputChange(fieldId, file);
    }, [handleInputChange]);

    const validateField = useCallback((field: FormField, value: any): string | null => {
        const error = validateFieldValue(field, value);
        setValidationErrors(prev => ({ ...prev, [field.id]: error }));
        return error;
    }, []);

    const validateAllFields = useCallback((): boolean => {
        if (!selectedTemplate) return false;
        let isValid = true;
        const newErrors: Record<string, string | null> = {};
        for (const field of selectedTemplate.fields) {
            if (!evaluateFieldVisibility(field, formData, selectedTemplate.visibilityRules)) continue;
            const error = validateFieldValue(field, formData[field.id]);
            newErrors[field.id] = error;
            if (error) isValid = false;
        }
        setValidationErrors(newErrors);
        return isValid;
    }, [selectedTemplate, formData]);

    const handleSubmit = async () => {
        if (!selectedTemplate || !user || !firestore || !storage || !users) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione una plantilla y asegúrese de que todo esté cargado.' });
            return;
        }
        if (Object.values(fileErrors).some(err => err)) {
            toast({ variant: 'destructive', title: 'Errores en archivos', description: 'Por favor, corrija los errores en los archivos adjuntos antes de enviar.' });
            return;
        }
        if (!validateAllFields()) {
            toast({ variant: 'destructive', title: 'Errores de validación', description: 'Por favor, corrija los errores en el formulario antes de enviar.' });
            return;
        }

        setIsSubmitting(true);

        const targetUserId = requestOnBehalfOf || user.uid;

        if (targetUserId !== user.uid) {
            const isAuthorized = availableSubjects.some(u => u.id === targetUserId);
            if (!isAuthorized) {
                toast({ title: 'Permiso denegado', description: 'No tienes permiso para crear solicitudes a nombre de este usuario.', variant: 'destructive' });
                setIsSubmitting(false);
                return;
            }
        }

        const requestsCollection = collection(firestore, 'users', targetUserId, 'requests');
        const newRequestRef = doc(requestsCollection);
        const newRequestId = newRequestRef.id;
        const now = new Date().toISOString();

        // File uploads
        const documentUploadPromises: Promise<any>[] = [];
        const fileFields = selectedTemplate.fields.filter(f => f.type === 'file');
        const newFormData = { ...formData };

        for (const field of fileFields) {
            const file = formData[field.id] as File;
            if (file) {
                const filePath = `requests/${targetUserId}/${newRequestId}/${file.name}`;
                const fileStorageRef = storageRef(storage, filePath);
                const uploadTask = uploadBytesResumable(fileStorageRef, file, { customMetadata: { ownerId: targetUserId } });

                const uploadPromise = new Promise((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(prev => ({ ...prev, [field.id]: progress }));
                        },
                        (error) => { console.error("Upload failed for", field.id, error); reject(error); },
                        async () => {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            const docId = doc(collection(firestore, 'dummy')).id;
                            newFormData[field.id] = docId;
                            resolve({
                                id: docId, requestId: newRequestId,
                                filename: file.name, contentType: file.type, size: file.size,
                                uploadDate: now, url: downloadURL, storagePath: filePath,
                            });
                        }
                    );
                });
                documentUploadPromises.push(uploadPromise);
            }
        }

        const uploadedDocuments = (await Promise.all(documentUploadPromises)).filter(Boolean);
        const { stepsWithTasks } = await evaluateAndAddInitialSteps(newFormData, selectedTemplate, newRequestId, targetUserId, now, firestore, users);

        const newRequest = {
            id: newRequestId,
            title: `${selectedTemplate.name} - ${new Date().toLocaleDateString('es-ES')}`,
            templateId: selectedTemplate.id,
            submittedBy: targetUserId,
            createdById: user.uid,
            createdByName: user.fullName || user.email,
            createdAt: now,
            updatedAt: now,
            status: 'In Progress',
            priority: 'Media',
            completedAt: null,
            formData: newFormData,
            steps: stepsWithTasks.map((step: any, index: number) => ({
                id: step.id, name: step.name,
                status: index === 0 ? 'Active' : 'Pending',
                assigneeId: null, completedAt: null, taskId: step.taskId,
            })),
            documents: uploadedDocuments,
        };

        try {
            setDocumentNonBlocking(newRequestRef, newRequest, {});

            const auditLogCollection = collection(newRequestRef, 'audit_logs');
            addDocumentNonBlocking(auditLogCollection, {
                requestId: newRequestId,
                userId: user.uid,
                userFullName: user.fullName || user.email,
                userAvatarUrl: user.avatarUrl,
                timestamp: now,
                action: 'REQUEST_SUBMITTED',
                details: { title: newRequest.title }
            });

            assignInitialTask(newRequest, selectedTemplate, users, firestore);

            toast({ title: '¡Solicitud Enviada!', description: 'Su solicitud ha sido enviada con éxito.' });
            router.push('/');
        } catch (error) {
            console.error("Error submitting request:", error);
            toast({ variant: 'destructive', title: 'Error al enviar', description: 'No se pudo enviar la solicitud. Por favor, inténtelo de nuevo.' });
            setIsSubmitting(false);
        }
    };

    return {
        // Template
        templates, selectedTemplate, selectedTemplateId, setSelectedTemplateId,
        templateIdFromUrl: templateId,
        // Users / subjects
        availableSubjects, filteredSubjects, selectedSubject,
        requestOnBehalfOf, setRequestOnBehalfOf,
        userSelectorOpen, setUserSelectorOpen,
        userSearch, setUserSearch,
        // Form state
        formData, fileErrors, uploadProgress, validationErrors,
        isSubmitting, isUserLoading,
        // Handlers
        handleInputChange, handleFileChange, validateField, handleSubmit,
    };
}
