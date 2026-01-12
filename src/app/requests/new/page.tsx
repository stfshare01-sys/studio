
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
import { addDocumentNonBlocking, setDocumentNonBlocking, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Template } from "@/lib/types";
import { collection, doc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

export default function NewRequestPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();

    const templateId = searchParams.get('templateId');
    const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>(templateId || undefined);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const [formData, setFormData] = React.useState<Record<string, any>>({});

    const firestore = useFirestore();
    const templatesRef = useMemoFirebase(() => collection(firestore, 'request_templates'), [firestore]);
    const { data: templates } = useCollection<Template>(templatesRef);

    const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

    const handleInputChange = (fieldId: string, value: any) => {
        setFormData(prev => ({...prev, [fieldId]: value}));
    }

    const handleSubmit = async () => {
        if (!selectedTemplate || !user || !firestore) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Por favor, seleccione una plantilla y asegúrese de haber iniciado sesión.',
            });
            return;
        }

        setIsSubmitting(true);

        const requestsCollection = collection(firestore, 'users', user.uid, 'requests');
        const newRequestRef = doc(requestsCollection); // Create a reference with a new ID
        const newRequestId = newRequestRef.id;
        const now = new Date().toISOString();

        // Evaluate rules to see if any additional steps are needed
        const additionalSteps = selectedTemplate.rules?.reduce((acc, rule) => {
            const fieldValue = formData[rule.condition.fieldId];
            let conditionMet = false;
            if (fieldValue !== undefined) {
                const val = parseFloat(fieldValue);
                const ruleVal = parseFloat(rule.condition.value);
                switch (rule.condition.operator) {
                    case '>': if (val > ruleVal) conditionMet = true; break;
                    case '<': if (val < ruleVal) conditionMet = true; break;
                    case '==': if (val == ruleVal) conditionMet = true; break;
                    case '!=': if (val != ruleVal) conditionMet = true; break;
                    case '>=': if (val >= ruleVal) conditionMet = true; break;
                    case '<=': if (val <= ruleVal) conditionMet = true; break;
                }
            }

            if (conditionMet && rule.action.type === 'REQUIRE_ADDITIONAL_STEP') {
                const stepToAdd = selectedTemplate.steps.find(s => s.id === rule.action.stepId);
                if (stepToAdd && !acc.some(s => s.id === stepToAdd.id)) {
                    acc.push(stepToAdd);
                }
            }
            return acc;
        }, [] as typeof selectedTemplate.steps) || [];

        const finalSteps = [...selectedTemplate.steps, ...additionalSteps];

        // Create task documents in parallel
        const taskPromises = finalSteps.map(async (step, index) => {
            const tasksCollection = collection(firestore, 'tasks');
            const newTaskRef = doc(tasksCollection);
            const taskData = {
                id: newTaskRef.id,
                requestId: newRequestId,
                requestTitle: `${selectedTemplate.name} - ${new Date().toLocaleDateString('es-ES')}`,
                requestOwnerId: user.uid,
                stepId: step.id,
                name: step.name,
                status: index === 0 ? 'Active' : 'Pending',
                assigneeId: null,
                completedAt: null,
                createdAt: now,
            };
            // Use a non-blocking set for the task
            setDocumentNonBlocking(newTaskRef, taskData, {});
            return { stepId: step.id, taskId: newTaskRef.id };
        });

        const taskResults = await Promise.all(taskPromises);
        const taskIdMap = new Map(taskResults.map(r => [r.stepId, r.taskId]));
        
        const newRequest = {
            id: newRequestId,
            title: `${selectedTemplate.name} - ${new Date().toLocaleDateString('es-ES')}`,
            templateId: selectedTemplate.id,
            submittedBy: user.uid,
            createdAt: now,
            updatedAt: now,
            status: 'In Progress',
            completedAt: null,
            formData,
            steps: finalSteps.map((step, index) => ({
                id: step.id,
                name: step.name,
                status: index === 0 ? 'Active' : 'Pending',
                assigneeId: null,
                completedAt: null,
                taskId: taskIdMap.get(step.id) || null,
            })),
            documents: [], // File handling would be implemented here
        };

        try {
            // Set the main request document
            setDocumentNonBlocking(newRequestRef, newRequest, {});

            // Create initial audit log
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

    const renderField = (field: Template['fields'][0]) => {
        const value = formData[field.id];
        switch (field.type) {
            case 'textarea':
                return <Textarea id={field.id} value={value || ''} onChange={(e) => handleInputChange(field.id, e.target.value)} placeholder={`Introduzca ${field.label.toLowerCase()}`} />;
            case 'select':
                return (
                    <Select value={value} onValueChange={(val) => handleInputChange(field.id, val)}>
                        <SelectTrigger id={field.id}><SelectValue placeholder={`Seleccione ${field.label.toLowerCase()}`} /></SelectTrigger>
                        <SelectContent>
                            {field.options?.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                        </SelectContent>
                    </Select>
                );
            case 'radio':
                return (
                    <RadioGroup id={field.id} value={value} onValueChange={(val) => handleInputChange(field.id, val)} className="flex items-center gap-4">
                        {field.options?.map(option => (
                            <div key={option} className="flex items-center space-x-2">
                                <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                );
            case 'checkbox':
                return (
                    <div className="flex items-center space-x-2">
                        <Checkbox id={field.id} checked={!!value} onCheckedChange={(checked) => handleInputChange(field.id, checked)} />
                        <Label htmlFor={field.id} className="font-normal">{field.label}</Label>
                    </div>
                );
            case 'file':
                 // NOTE: File upload logic is complex and requires backend storage integration (e.g., Firebase Storage).
                 // This is a placeholder UI. A real implementation would use a state to hold the file object and upload it on submit.
                return <Input id={field.id} type="file" onChange={(e) => handleInputChange(field.id, e.target.files?.[0])} />;
            case 'date':
            case 'number':
            case 'text':
            default:
                return <Input id={field.id} type={field.type} value={value || ''} onChange={(e) => handleInputChange(field.id, e.target.value)} placeholder={`Introduzca ${field.label.toLowerCase()}`} />;
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
                                    disabled={!!templateId}
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
                                    {selectedTemplate.fields.map(field => (
                                        <div key={field.id} className="space-y-2">
                                            {field.type !== 'checkbox' && <Label htmlFor={field.id}>{field.label}</Label>}
                                            {renderField(field)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
