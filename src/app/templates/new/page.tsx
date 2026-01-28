"use client";

import SiteLayout from "@/components/site-layout";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default function NewTemplatePage() {
    return (
        <SiteLayout>
            <TemplateEditor mode="create" />
        </SiteLayout>
    );
}
