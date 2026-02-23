
"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePlus, FolderKanban, WandSparkles, Pencil, Globe, Lock, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import type { Template } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SimulateChangeDialog } from "@/components/templates/simulate-change-dialog";
import React, { useEffect, useState } from "react";
import { preInstalledTemplates } from "@/lib/pre-installed-templates";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";

function TemplateSkeleton() {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Skeleton className="h-4 w-1/4" />
            </CardContent>
            <CardFooter>
                <Skeleton className="h-10 w-full" />
            </CardFooter>
        </Card>
    );
}

export default function TemplatesPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { canWrite, isAdmin } = usePermissions();
    const canCreate = isAdmin || canWrite('templates');

    const templatesRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'request_templates');
    }, [firestore]);
    const { data: templates, isLoading } = useCollection<Template>(templatesRef);

    const [simulationTemplate, setSimulationTemplate] = React.useState<Template | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const { toast } = useToast();

    const handleToggleStatus = async (template: Template) => {
        if (!firestore) return;
        setTogglingId(template.id);
        try {
            const newStatus = template.status === 'published' ? 'draft' : 'published';
            const templateRef = doc(firestore, 'request_templates', template.id);
            await updateDoc(templateRef, {
                status: newStatus,
                updatedAt: new Date().toISOString(),
                ...(newStatus === 'published' ? { publishedAt: new Date().toISOString() } : {}),
            });
            toast({
                title: newStatus === 'published' ? 'Plantilla publicada' : 'Plantilla despublicada',
                description: `"${template.name}" ahora está ${newStatus === 'published' ? 'disponible para solicitudes' : 'en modo borrador'}.`,
            });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo cambiar el estado.', variant: 'destructive' });
        } finally {
            setTogglingId(null);
        }
    };

    // Seeding logic for pre-installed templates
    useEffect(() => {
        if (isLoading || !firestore || !templates || !templatesRef || !canCreate) return;

        const seedData = async () => {
            const existingTemplateNames = new Set(templates.map(t => t.name));
            const templatesToCreate = preInstalledTemplates.filter(
                p => !existingTemplateNames.has(p.name)
            );

            if (templatesToCreate.length > 0) {
                console.log(`Seeding ${templatesToCreate.length} new templates...`);
                try {
                    for (const templateData of templatesToCreate) {
                        const newTemplateRef = doc(templatesRef);
                        const newTemplate = {
                            ...templateData,
                            id: newTemplateRef.id,
                        };
                        await setDoc(newTemplateRef, newTemplate);
                    }
                    console.log("Seeding complete.");
                } catch (error) {
                    console.error("Error seeding pre-installed templates:", error);
                }
            }
        };

        // Only run seeding if templates are loaded and the user has permission.
        if (!isLoading && canCreate) {
            seedData();
        }
    }, [templates, isLoading, firestore, templatesRef, canCreate]);

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between p-4 sm:p-6">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Plantillas de Flujo de Trabajo</h1>
                        <p className="text-muted-foreground">Construya, gestione y simule los planos de sus procesos.</p>
                    </div>
                    {canCreate && (
                        <Button asChild>
                            <Link href="/templates/new">
                                <FilePlus className="mr-2 h-4 w-4" />
                                Nueva Plantilla
                            </Link>
                        </Button>
                    )}
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {isLoading && Array.from({ length: 3 }).map((_, i) => <TemplateSkeleton key={i} />)}
                        {templates?.map((template) => (
                            <Card key={template.id} className="flex flex-col">
                                <CardHeader>
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                            <FolderKanban className="h-6 w-6 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <CardTitle>{template.name}</CardTitle>
                                                <Badge
                                                    variant={template.status === 'published' ? 'default' : 'secondary'}
                                                    className={cn(
                                                        "text-xs",
                                                        template.status === 'published'
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                                            : ''
                                                    )}
                                                >
                                                    {template.status === 'published' ? (
                                                        <><Globe className="mr-1 h-3 w-3" /> Publicada</>
                                                    ) : (
                                                        <><Lock className="mr-1 h-3 w-3" /> Borrador</>
                                                    )}
                                                </Badge>
                                            </div>
                                            <CardDescription>{template.description}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-grow">
                                    <div className="text-sm font-medium">
                                        {template.fields.length} campos, {template.steps.length} pasos
                                    </div>
                                </CardContent>
                                <CardFooter className="grid grid-cols-2 gap-2">
                                    {template.status === 'published' ? (
                                        <Button asChild className="w-full">
                                            <Link href={`/requests/new?templateId=${template.id}`}>Usar</Link>
                                        </Button>
                                    ) : (
                                        <Button variant="outline" className="w-full" disabled>
                                            <Lock className="mr-2 h-4 w-4" /> Borrador
                                        </Button>
                                    )}
                                    {canCreate ? (
                                        <Button variant="outline" asChild className="w-full">
                                            <Link href={`/templates/edit/${template.id}`}>
                                                <Pencil className="mr-2 h-4 w-4" />
                                                Editar
                                            </Link>
                                        </Button>
                                    ) : <div />}
                                    {canCreate && (
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                "col-span-2 w-full text-sm",
                                                template.status === 'published'
                                                    ? 'text-green-600 hover:text-green-700'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                            disabled={togglingId === template.id}
                                            onClick={() => handleToggleStatus(template)}
                                        >
                                            {template.status === 'published' ? (
                                                <><ToggleRight className="mr-2 h-4 w-4" /> Publicada — Clic para despublicar</>
                                            ) : (
                                                <><ToggleLeft className="mr-2 h-4 w-4" /> Borrador — Clic para publicar</>
                                            )}
                                        </Button>
                                    )}
                                    {isAdmin && (
                                        <div className="col-span-2">
                                            <Button variant="secondary" className="w-full" onClick={() => setSimulationTemplate(template)}>
                                                <WandSparkles className="mr-2 h-4 w-4" />
                                                Simular Cambio
                                            </Button>
                                        </div>
                                    )}
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                    {!isLoading && templates?.length === 0 && (
                        <EmptyState
                            variant="documents"
                            title="No tienes plantillas"
                            description="Crea una nueva plantilla para empezar a diseñar tus procesos de flujo de trabajo."
                            actionLabel={canCreate ? "Nueva Plantilla" : undefined}
                            onAction={canCreate ? () => window.location.href = '/templates/new' : undefined}
                        />
                    )}
                </main>
            </div>

            {simulationTemplate && (
                <SimulateChangeDialog
                    template={simulationTemplate}
                    isOpen={!!simulationTemplate}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSimulationTemplate(null);
                        }
                    }}
                />
            )}
        </SiteLayout>
    );
}


