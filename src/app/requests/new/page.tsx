"use client"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { templates } from "@/lib/data";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React from "react";

export default function NewRequestPage() {
    const searchParams = useSearchParams();
    const templateId = searchParams.get('templateId');
    const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>(templateId || undefined);

    const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

    return (
        <div className="flex flex-1 flex-col">
            <header className="flex items-center justify-between p-4 sm:p-6">
                <h1 className="text-2xl font-bold tracking-tight">Enviar Nueva Solicitud</h1>
                <div className="flex gap-2">
                    <Button variant="outline" asChild><Link href="/">Cancelar</Link></Button>
                    <Button>Enviar Solicitud</Button>
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
                            >
                                <SelectTrigger id="template-select">
                                    <SelectValue placeholder="Elija una plantilla de flujo de trabajo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates.map(template => (
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
                                            <Textarea id={field.id} placeholder={`Introduzca ${field.label.toLowerCase()}`} />
                                        ) : (
                                            <Input id={field.id} type={field.type} placeholder={`Introduzca ${field.label.toLowerCase()}`} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
