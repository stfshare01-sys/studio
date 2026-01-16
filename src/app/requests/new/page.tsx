

"use client"
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { addDocumentNonBlocking, setDocumentNonBlocking, useCollection, useFirestore, useMemoFirebase, useUser, useStorage, updateDocumentNonBlocking } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Template, User, FormField } from "@/lib/types";
import { collection, doc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { intelligentTaskAssignment } from "@/ai/flows/intelligent-task-assignment";
import { evaluateAndAddInitialSteps } from "@/lib/workflow-engine";
import {
    UserIdentityField,
    DynamicSelect,
    FormTableField,
    evaluateFieldVisibility,
    validateFieldValue,
    isValidNumber,
    isValidEmail,
} from "@/components/form-fields";

const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB


async function assignInitialTask(
    request: any, 
    template: Template,
    users: User[],
    firestore: any,
) {
    if (!users || users.length === 0) {
        console.warn("No users available for auto-assignment.");
        return;
    }

    const firstStep = request.steps[0];
    const firstStepDefinition = template.steps.find(s => s.id === firstStep.id);
    const firstTaskRef = doc(firestore, 'tasks', firstStep.taskId);

    if (!firstStepDefinition || !firstStepDefinition.assigneeRole) {
        console.log("First step has no defined assignee role. Skipping auto-assignment.");
        return;
    }

    try {
        const suggestion = await intelligentTaskAssignment({
            taskDescription: `Asignar la tarea inicial: "${firstStep.name}" para la solicitud "${request.title}"`,
            assigneeRole: firstStepDefinition.assigneeRole,
            availableUsers: users.map(u => ({
                userId: u.id,
                fullName: u.fullName,
                department: u.department,
                skills: u.skills ?? [],
                currentWorkload: u.currentWorkload ?? 0,
                pastPerformance: 5, // Mocked
            }))
        });

        if (suggestion.suggestedUserId) {
            const assignee = users.find(u => u.id === suggestion.suggestedUserId);
            
            // 1. Update the task document
            updateDocumentNonBlocking(firstTaskRef, { assigneeId: suggestion.suggestedUserId });

            // 2. Update the request document's steps array
            const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
            const updatedSteps = request.steps.map((s: any) => 
                s.id === firstStep.id ? { ...s, assigneeId: suggestion.suggestedUserId } : s
            );
            updateDocumentNonBlocking(requestRef, { steps: updatedSteps });

            // 3. Add an audit log for the assignment
            const auditLogCollection = collection(requestRef, 'audit_logs');
            addDocumentNonBlocking(auditLogCollection, {
                requestId: request.id,
                userId: 'system', // Indicates an automatic action
                userFullName: 'FlowMaster AI',
                timestamp: new Date().toISOString(),
                action: 'STEP_ASSIGNEE_CHANGED',
                details: { 
                    stepName: firstStep.name,
                    assigneeName: assignee?.fullName || suggestion.suggestedUserId,
                    reason: suggestion.reason
                }
            });
             console.log(`Task '${firstStep.name}' automatically assigned to ${assignee?.fullName}. Reason: ${suggestion.reason}`);
        }
    } catch (error) {
        console.error("Error during automatic task assignment:", error);
    }
}


export default function NewRequestPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const storage = useStorage();

    const templateId = searchParams.get('templateId');
    const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>(templateId || undefined);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const [formData, setFormData] = React.useState<Record<string, any>>({});
    const [fileErrors, setFileErrors] = React.useState<Record<string, string>>({});
    const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
    const [validationErrors, setValidationErrors] = React.useState<Record<string, string | null>>({});

    const firestore = useFirestore();
    const templatesRef = useMemoFirebase(() => collection(firestore, 'request_templates'), [firestore]);
    const { data: templates } = useCollection<Template>(templatesRef);
    const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users } = useCollection<User>(usersQuery);

    const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

    const handleFileChange = (fieldId: string, file: File | undefined) => {
        if (!file) {
            handleInputChange(fieldId, undefined);
            setFileErrors(prev => ({ ...prev, [fieldId]: "" }));
            return;
        }

        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            setFileErrors(prev => ({ ...prev, [fieldId]: "Tipo de archivo no permitido." }));
            handleInputChange(fieldId, undefined); // Clear invalid file
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setFileErrors(prev => ({ ...prev, [fieldId]: `El archivo excede el límite de 5MB.` }));
            handleInputChange(fieldId, undefined); // Clear invalid file
            return;
        }

        setFileErrors(prev => ({ ...prev, [fieldId]: "" }));
        handleInputChange(fieldId, file);
    }

    const handleInputChange = useCallback((fieldId: string, value: any) => {
        setFormData(prev => ({...prev, [fieldId]: value}));
        // Clear validation error when user changes value
        setValidationErrors(prev => ({...prev, [fieldId]: null}));
    }, []);

    // Validate a single field
    const validateField = useCallback((field: FormField, value: any): string | null => {
        const error = validateFieldValue(field, value);
        setValidationErrors(prev => ({...prev, [field.id]: error}));
        return error;
    }, []);

    // Validate all fields before submission
    const validateAllFields = useCallback((): boolean => {
        if (!selectedTemplate) return false;

        let isValid = true;
        const newErrors: Record<string, string | null> = {};

        for (const field of selectedTemplate.fields) {
            // Skip hidden fields
            if (!evaluateFieldVisibility(field, formData, selectedTemplate.visibilityRules)) {
                continue;
            }
            const error = validateFieldValue(field, formData[field.id]);
            newErrors[field.id] = error;
            if (error) isValid = false;
        }

        setValidationErrors(newErrors);
        return isValid;
    }, [selectedTemplate, formData]);

    const handleSubmit = async () => {
        if (!selectedTemplate || !user || !firestore || !storage || !users) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Por favor, seleccione una plantilla y asegúrese de que todo esté cargado.',
            });
            return;
        }
        if (Object.values(fileErrors).some(err => err)) {
             toast({
                variant: 'destructive',
                title: 'Errores en archivos',
                description: 'Por favor, corrija los errores en los archivos adjuntos antes de enviar.',
            });
            return;
        }
        // Validate all fields
        if (!validateAllFields()) {
            toast({
                variant: 'destructive',
                title: 'Errores de validación',
                description: 'Por favor, corrija los errores en el formulario antes de enviar.',
            });
            return;
        }

        setIsSubmitting(true);

        const requestsCollection = collection(firestore, 'users', user.uid, 'requests');
        const newRequestRef = doc(requestsCollection);
        const newRequestId = newRequestRef.id;
        const now = new Date().toISOString();

        // Handle file uploads
        const documentUploadPromises: Promise<any>[] = [];
        const fileFields = selectedTemplate.fields.filter(f => f.type === 'file');
        const newFormData = {...formData};

        for (const field of fileFields) {
            const file = formData[field.id] as File;
            if (file) {
                const filePath = `requests/${newRequestId}/${file.name}`;
                const fileStorageRef = storageRef(storage, filePath);
                
                const uploadTask = uploadBytesResumable(fileStorageRef, file, {
                    customMetadata: { ownerId: user.uid }
                });

                const uploadPromise = new Promise((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(prev => ({...prev, [field.id]: progress}));
                        },
                        (error) => {
                            console.error("Upload failed for", field.id, error);
                            reject(error);
                        },
                        async () => {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            const docId = doc(collection(firestore, 'dummy')).id;
                            
                            newFormData[field.id] = docId;

                            resolve({
                                id: docId,
                                requestId: newRequestId,
                                filename: file.name,
                                contentType: file.type,
                                size: file.size,
                                uploadDate: now,
                                url: downloadURL,
                                storagePath: filePath, // Save storage path for deletion
                            });
                        }
                    );
                });
                documentUploadPromises.push(uploadPromise);
            }
        }
        
        const uploadedDocuments = (await Promise.all(documentUploadPromises)).filter(Boolean);

        const { stepsWithTasks } = await evaluateAndAddInitialSteps(newFormData, selectedTemplate, newRequestId, user.uid, now, firestore, users);

        const newRequest = {
            id: newRequestId,
            title: `${selectedTemplate.name} - ${new Date().toLocaleDateString('es-ES')}`,
            templateId: selectedTemplate.id,
            submittedBy: user.uid,
            createdAt: now,
            updatedAt: now,
            status: 'In Progress',
            priority: 'Media',
            completedAt: null,
            formData: newFormData,
            steps: stepsWithTasks.map((step, index) => ({
                id: step.id,
                name: step.name,
                status: index === 0 ? 'Active' : 'Pending',
                assigneeId: null,
                completedAt: null,
                taskId: step.taskId,
            })),
            documents: uploadedDocuments,
        };

        try {
            setDocumentNonBlocking(newRequestRef, newRequest, {});

            const auditLogCollection = collection(newRequestRef, 'audit_logs');
            const auditLogData = {
                requestId: newRequestId,
                userId: user.uid,
                userFullName: user.fullName || user.email,
                userAvatarUrl: user.avatarUrl,
                timestamp: now,
                action: 'REQUEST_SUBMITTED',
                details: { title: newRequest.title }
            };
            addDocumentNonBlocking(auditLogCollection, auditLogData);
            
            // Non-blocking call to assign the initial task
            assignInitialTask(newRequest, selectedTemplate, users, firestore);

            toast({
                title: '¡Solicitud Enviada!',
                description: 'Su solicitud ha sido enviada con éxito.',
            });

            router.push('/');
        } catch (error) {
            console.error("Error submitting request: ", error);
            toast({
                variant: 'destructive',
                title: 'Error al enviar',
                description: 'No se pudo enviar la solicitud. Por favor, inténtelo de nuevo.',
            });
            setIsSubmitting(false);
        }
    };

    const renderField = (field: FormField) => {
        const value = formData[field.id];
        const progress = uploadProgress[field.id];
        const fileError = fileErrors[field.id];
        const validationError = validationErrors[field.id];

        switch (field.type) {
            case 'textarea':
                return (
                    <div className="space-y-2">
                        <Textarea
                            id={field.id}
                            value={value || ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            onBlur={() => validateField(field, value)}
                            placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                            disabled={isSubmitting}
                            className={validationError ? 'border-destructive' : ''}
                        />
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'select':
                return (
                    <div className="space-y-2">
                        <Select value={value} onValueChange={(val) => handleInputChange(field.id, val)} disabled={isSubmitting}>
                            <SelectTrigger id={field.id} className={validationError ? 'border-destructive' : ''}>
                                <SelectValue placeholder={field.placeholder || `Seleccione ${field.label.toLowerCase()}`} />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options?.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'dynamic-select':
                return (
                    <DynamicSelect
                        field={field}
                        value={value}
                        onChange={(val) => handleInputChange(field.id, val)}
                        formData={formData}
                        disabled={isSubmitting}
                        error={validationError}
                    />
                );
            case 'radio':
                return (
                    <div className="space-y-2">
                        <RadioGroup id={field.id} value={value} onValueChange={(val) => handleInputChange(field.id, val)} className="flex flex-wrap items-center gap-4" disabled={isSubmitting}>
                            {field.options?.map(option => (
                                <div key={option} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                    <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'checkbox':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                            <Checkbox id={field.id} checked={!!value} onCheckedChange={(checked) => handleInputChange(field.id, checked)} disabled={isSubmitting} />
                            <Label htmlFor={field.id} className="font-normal">{field.label}</Label>
                        </div>
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'file':
                return (
                    <div className="space-y-2">
                        <Input id={field.id} type="file" onChange={(e) => handleFileChange(field.id, e.target.files?.[0])} disabled={isSubmitting} />
                        {fileError && <p className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-4 w-4"/> {fileError}</p>}
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {progress > 0 && progress < 100 && <Progress value={progress} className="w-full" />}
                        {progress === 100 && <p className="text-sm text-green-600">Carga completa.</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'table':
                return (
                    <FormTableField
                        field={field}
                        value={value || []}
                        onChange={(rows) => handleInputChange(field.id, rows)}
                        formData={formData}
                        disabled={isSubmitting}
                        error={validationError}
                    />
                );
            case 'user-identity':
                return (
                    <UserIdentityField
                        field={field}
                        value={value}
                        onChange={(val) => handleInputChange(field.id, val)}
                    />
                );
            case 'email':
                return (
                    <div className="space-y-2">
                        <Input
                            id={field.id}
                            type="email"
                            value={value || ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            onBlur={() => validateField(field, value)}
                            placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                            disabled={isSubmitting}
                            className={validationError ? 'border-destructive' : ''}
                        />
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'number':
                return (
                    <div className="space-y-2">
                        <Input
                            id={field.id}
                            type="number"
                            value={value ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Only update if it's a valid number or empty
                                if (val === '' || isValidNumber(val)) {
                                    handleInputChange(field.id, val === '' ? '' : parseFloat(val));
                                }
                            }}
                            onBlur={() => validateField(field, value)}
                            placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                            disabled={isSubmitting}
                            className={validationError ? 'border-destructive' : ''}
                        />
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'date':
                return (
                    <div className="space-y-2">
                        <Input
                            id={field.id}
                            type="date"
                            value={value || ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            onBlur={() => validateField(field, value)}
                            disabled={isSubmitting}
                            className={validationError ? 'border-destructive' : ''}
                        />
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
            case 'text':
            default:
                return (
                    <div className="space-y-2">
                        <Input
                            id={field.id}
                            type="text"
                            value={value || ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            onBlur={() => validateField(field, value)}
                            placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                            disabled={isSubmitting}
                            className={validationError ? 'border-destructive' : ''}
                        />
                        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                    </div>
                );
        }
    }


    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between p-4 sm:p-6">
                    <h1 className="text-2xl font-bold tracking-tight">Enviar Nueva Solicitud</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild><Link href="/">Cancelar</Link></Button>
                        <Button onClick={handleSubmit} disabled={!selectedTemplate || isSubmitting || isUserLoading}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Solicitud
                        </Button>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Detalles de la Solicitud</CardTitle>
                            <CardDescription>
                                {selectedTemplate ? `Rellene el formulario para una nueva solicitud de "${selectedTemplate.name}".` : 'Primero, seleccione una plantilla para su solicitud.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="template-select">Seleccione una Plantilla</Label>
                                <Select
                                    value={selectedTemplateId}
                                    onValueChange={setSelectedTemplateId}
                                    disabled={!!templateId || isSubmitting}
                                >
                                    <SelectTrigger id="template-select">
                                        <SelectValue placeholder="Elija una plantilla de flujo de trabajo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates?.map(template => (
                                            <SelectItem key={template.id} value={template.id}>
                                                {template.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedTemplate && (
                                <div className="space-y-4 border-t pt-6">
                                    {selectedTemplate.fields.map(field => {
                                        // Check visibility rules
                                        const isVisible = evaluateFieldVisibility(
                                            field,
                                            formData,
                                            selectedTemplate.visibilityRules
                                        );
                                        if (!isVisible) return null;

                                        return (
                                            <div key={field.id} className="space-y-2">
                                                {field.type !== 'checkbox' && field.type !== 'user-identity' && (
                                                    <Label htmlFor={field.id}>
                                                        {field.label}
                                                        {field.validations?.some(v => v.type === 'required') && (
                                                            <span className="text-destructive ml-1">*</span>
                                                        )}
                                                    </Label>
                                                )}
                                                {renderField(field)}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
