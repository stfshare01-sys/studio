import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { requests } from "@/lib/data";
import { FilePlus } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
        <Button asChild>
          <Link href="/requests/new">
            <FilePlus className="mr-2 h-4 w-4" />
            Nueva Solicitud
          </Link>
        </Button>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes Activas</CardTitle>
            <CardDescription>Rastree el estado de todas las solicitudes en curso.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestsTable requests={requests} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
