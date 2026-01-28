"use client";

import SiteLayout from "@/components/site-layout";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { useParams } from "next/navigation";
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditTemplatePage() {
    const params = useParams();
    const templateId = params.id as string;
    const firestore = useFirestore();

    const templateRef = useMemoFirebase(() => {
        if (!firestore || !templateId) return null;
        return doc(firestore, 'request_templates', templateId);
    }, [firestore, templateId]);

    const { data: templateData, isLoading } = useDoc<any>(templateRef);

    if (isLoading) {
        return (
            <SiteLayout>
                <div className="flex flex-1 flex-col">
                    <header className="flex items-center justify-between p-4 sm:p-6">
                        <Skeleton className="h-8 w-64" />
                        <div className="flex gap-2">
                            <Skeleton className="h-10 w-24" />
                            <Skeleton className="h-10 w-32" />
                        </div>
                    </header>
                    <main className="grid flex-1 items-start gap-4 p-4 sm:gap-8 sm:p-6 md:grid-cols-[1fr_2fr]">
                        <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
                            <Skeleton className="h-64 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                        <Skeleton className="h-[80vh] w-full" />
                    </main>
                </div>
            </SiteLayout>
        )
    }

    return (
        <SiteLayout>
            <TemplateEditor mode="edit" templateId={templateId} initialData={templateData} />
        </SiteLayout>
    );
}
