'use client';

import SiteLayout from '@/components/site-layout';
import AuditLogViewer from '@/components/admin/audit-log-viewer';

export default function SecurityCenterPage() {
    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Centro de Seguridad (Security Command Center)</h1>
                        <p className="text-muted-foreground">
                            Monitoreo de actividad, seguridad y accesos administrativos.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4">
                    <AuditLogViewer />
                </div>
            </div>
        </SiteLayout>
    );
}
