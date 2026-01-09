"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="rounded-full bg-destructive/10 p-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Error Inesperado</h1>
          <p className="text-muted-foreground">
            Ha ocurrido un error en la aplicación. Puede intentar recargar la página o volver al inicio.
          </p>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
            Código: {error.digest}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Ir al inicio
            </Link>
          </Button>
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}
