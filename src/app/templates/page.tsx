

"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePlus, FolderKanban } from "lucide-react";
import Link from "next/link";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import type { Template } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

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
  const templatesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'request_templates');
  }, [firestore]);
  const { data: templates, isLoading } = useCollection<Template>(templatesRef);

  return (
    <SiteLayout>
        <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
            <h1 className="text-2xl font-bold tracking-tight">Plantillas</h1>
            <Button asChild>
                <Link href="/templates/new">
                    <FilePlus className="mr-2 h-4 w-4" />
                    Nueva Plantilla
                </Link>
            </Button>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <TemplateSkeleton key={i} />)}
            {templates?.map((template) => (
                <Card key={template.id}>
                <CardHeader>
                    <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <FolderKanban className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                        <CardTitle>{template.name}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                    </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-sm font-medium">
                    {template.fields.length} campos, {template.steps.length} pasos
                    </div>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full">
                    <Link href={`/requests/new?templateId=${template.id}`}>Usar Plantilla</Link>
                    </Button>
                </CardFooter>
                </Card>
            ))}
            </div>
            {!isLoading && templates?.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">No tienes plantillas</h3>
                        <p className="text-sm text-muted-foreground">Crea una nueva plantilla para empezar.</p>
                        <Button className="mt-4" asChild>
                            <Link href="/templates/new">
                                <FilePlus className="mr-2 h-4 w-4" />
                                Nueva Plantilla
                            </Link>
                        </Button>
                    </div>
                </div>
            )}
        </main>
        </div>
    </SiteLayout>
  );
}
