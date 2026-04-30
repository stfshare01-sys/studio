
'use client';

import SiteLayout from '@/components/site-layout';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { ArrowLeft, PlusCircle, Import, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/master-lists/data-table';
import { columns } from '@/components/master-lists/columns';
import type { MasterList } from "@/types/common.types";

function MasterListDataSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-md border">
        <div className="p-4">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

export default function MasterListPage() {
  const params = useParams();
  const router = useRouter();
  const listId = params.id as string;
  const firestore = useFirestore();

  const listDefRef = useMemoFirebase(() => {
    if (!firestore || !listId) return null;
    return doc(firestore, 'master_lists', listId);
  }, [firestore, listId]);

  const { data: listDef, isLoading: isLoadingDef } = useDoc<MasterList>(listDefRef);

  if (isLoadingDef) {
    return (
      <SiteLayout>
        <div className="flex flex-1 flex-col">
          <header className="p-4 sm:p-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-64 mt-2" />
          </header>
          <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
            <MasterListDataSkeleton />
          </main>
        </div>
      </SiteLayout>
    );
  }

  if (!listDef) {
    return (
      <SiteLayout>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center gap-4 p-4 sm:p-6">
            <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lista no encontrada</h1>
              <p className="text-muted-foreground">ID: {listId}</p>
            </div>
          </header>
          <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
            <Card>
              <CardHeader>
                <CardTitle>La lista maestra no existe</CardTitle>
                <CardDescription>
                  No se encontró ninguna lista maestra con el ID especificado en la base de datos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Esto puede ocurrir si:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>La lista fue eliminada</li>
                  <li>El ID en la URL es incorrecto</li>
                  <li>La lista nunca fue creada con este ID</li>
                </ul>
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => router.push('/master-lists')}>
                    Ver todas las listas
                  </Button>
                  <Button onClick={() => router.push('/master-lists/new')}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear nueva lista
                  </Button>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </SiteLayout>
    );
  }

  const dynamicColumns = columns(listDef.fields);

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-4 p-4 sm:p-6">
          <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{listDef.name}</h1>
            <p className="text-muted-foreground">{listDef.description}</p>
          </div>
        </header>
        <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Registros de Datos</CardTitle>
              <CardDescription>
                Añada, edite y gestione los registros de su lista maestra.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={dynamicColumns} listId={listId} listDef={listDef} />
            </CardContent>
          </Card>
        </main>
      </div>
    </SiteLayout>
  );
}
