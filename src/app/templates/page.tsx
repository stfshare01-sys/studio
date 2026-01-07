import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { templates } from "@/lib/data";
import { FilePlus, FolderKanban } from "lucide-react";
import Link from "next/link";

export default function TemplatesPage() {
  return (
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
          {templates.map((template) => (
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
      </main>
    </div>
  );
}
