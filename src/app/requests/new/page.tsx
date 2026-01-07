
"use client"
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDocumentNonBlocking, useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Template } from "@/lib/types";
import { collection } from "firebase/firestore";
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

    const handleInputChange = (fieldId: string, value: string) => {
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
        
        const newRequest = {
            title: `${selectedTemplate.name} - ${new Date().toLocaleDateString('es-ES')}`,
            templateId: selectedTemplate.id,
            submittedBy: user.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'In Progress',
            formData,
            steps: selectedTemplate.steps.map((step, index) => ({
                id: step.id,
                name: step.name,
                status: index === 0 ? 'Active' : 'Pending',
                assigneeId: null,
                completedAt: null,
            })),
            documents: [],
        };

        try {
            const requestsCollection = collection(firestore, 'users', user.uid, 'requests');
            // No se debe esperar a la función no bloqueante
            addDocumentNonBlocking(requestsCollection, newRequest);

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
                                            <Label htmlFor={field.id}>{field.label}</Label>
                                            {field.type === 'textarea' ? (
                                                <Textarea 
                                                    id={field.id} 
                                                    placeholder={`Introduzca ${field.label.toLowerCase()}`}
                                                    value={formData[field.id] || ''}
                                                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                                                />
                                            ) : (
                                                <Input 
                                                    id={field.id} 
                                                    type={field.type} 
                                                    placeholder={`Introduzca ${field.label.toLowerCase()}`} 
                                                    value={formData[field.id] || ''}
                                                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                                                />
                                            )}
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
