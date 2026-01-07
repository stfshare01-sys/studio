
import SiteLayout from "@/components/site-layout";
import { notFound } from "next/navigation";
import { requests, users } from "@/lib/data";
import { ArrowLeft, File as FileIcon, Paperclip, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { WorkflowStepper } from "@/components/requests/workflow-stepper";
import { AssigneeSuggester } from "@/components/requests/assignee-suggester";
import { Badge } from "@/components/ui/badge";

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  const request = requests.find(r => r.id === params.id);

  if (!request) {
    notFound();
  }

  const activeStep = request.steps.find(s => s.status === 'Active');

  return (
    <SiteLayout>
        <div className="flex flex-1 flex-col">
        <header className="flex items-center p-4 sm:p-6">
            <Button variant="outline" size="icon" asChild>
            <Link href="/">
                <ArrowLeft className="h-4 w-4" />
            </Link>
            </Button>
            <div className="ml-4">
                <h1 className="text-2xl font-bold tracking-tight">{request.title}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>ID: {request.id}</span>
                    <Separator orientation="vertical" className="h-4" />
                    <Badge
                    variant={
                        request.status === "Completed"
                        ? "default"
                        : request.status === "Rejected"
                        ? "destructive"
                        : "secondary"
                    }
                    className={request.status === 'Completed' ? 'bg-green-600 text-white' : ''}
                    >
                    {request.status}
                    </Badge>
                </div>
            </div>
        </header>

        <main className="grid flex-1 gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-3">
            <div className="md:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Progreso del Flujo de Trabajo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <WorkflowStepper steps={request.steps} />
                    </CardContent>
                </Card>

                {activeStep && !activeStep.assignee && (
                    <AssigneeSuggester step={activeStep} availableUsers={users} />
                )}
            </div>
            
            <div className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Información de la Solicitud</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Enviado por:</span>
                            <div className="ml-auto flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={request.submittedBy.avatarUrl} alt={request.submittedBy.name} />
                                    <AvatarFallback>{request.submittedBy.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span>{request.submittedBy.name}</span>
                            </div>
                        </div>
                        <Separator />
                        <dl className="grid gap-2">
                            {Object.entries(request.formData).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                    <dt className="text-muted-foreground">{key}</dt>
                                    <dd className="font-medium text-right">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>
                
                {request.documents.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Documentos Adjuntos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {request.documents.map(doc => (
                                    <li key={doc.name}>
                                        <a href={doc.url} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                                            <Paperclip className="h-4 w-4" />
                                            <span>{doc.name}</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
        </div>
    </SiteLayout>
  );
}
