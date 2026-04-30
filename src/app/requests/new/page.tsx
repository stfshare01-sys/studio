'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useNewRequest } from './hooks/use-new-request';
import { SubjectSelector } from './components/SubjectSelector';
import { RequestFormSection } from './components/RequestFormSection';

function NewRequestPageContent() {
    const router = useRouter();
    const {
        templates, selectedTemplate, selectedTemplateId, setSelectedTemplateId,
        templateIdFromUrl,
        availableSubjects, filteredSubjects, selectedSubject,
        requestOnBehalfOf, setRequestOnBehalfOf,
        userSelectorOpen, setUserSelectorOpen,
        userSearch, setUserSearch,
        formData, fileErrors, uploadProgress, validationErrors,
        isSubmitting, isUserLoading,
        handleInputChange, handleFileChange, validateField, handleSubmit,
    } = useNewRequest();

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
                                {selectedTemplate
                                    ? `Rellene el formulario para una nueva solicitud de "${selectedTemplate.name}".`
                                    : 'Primero, seleccione una plantilla para su solicitud.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="template-select">Seleccione una Plantilla</Label>
                                <Select
                                    value={selectedTemplateId}
                                    onValueChange={setSelectedTemplateId}
                                    disabled={!!templateIdFromUrl || isSubmitting}
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

                            <SubjectSelector
                                availableSubjects={availableSubjects}
                                filteredSubjects={filteredSubjects}
                                selectedSubject={selectedSubject}
                                requestOnBehalfOf={requestOnBehalfOf}
                                open={userSelectorOpen}
                                search={userSearch}
                                disabled={isSubmitting}
                                onOpenChange={setUserSelectorOpen}
                                onSearchChange={setUserSearch}
                                onSelect={setRequestOnBehalfOf}
                            />

                            {selectedTemplate && (
                                <RequestFormSection
                                    template={selectedTemplate}
                                    formData={formData}
                                    validationErrors={validationErrors}
                                    uploadProgress={uploadProgress}
                                    fileErrors={fileErrors}
                                    disabled={isSubmitting}
                                    userId={requestOnBehalfOf}
                                    targetUserId={requestOnBehalfOf}
                                    onSuccess={() => router.push('/hcm/incidences')}
                                    onCancel={() => setSelectedTemplateId(undefined)}
                                    onChange={handleInputChange}
                                    onBlur={validateField}
                                    onFileChange={handleFileChange}
                                />
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}

export default function NewRequestPage() {
    return (
        <Suspense fallback={
            <SiteLayout>
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </SiteLayout>
        }>
            <NewRequestPageContent />
        </Suspense>
    );
}
