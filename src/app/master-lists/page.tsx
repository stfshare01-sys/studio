

'use client';

import SiteLayout from '@/components/site-layout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { PlusCircle, Database, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import type { MasterList } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

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


export default function MasterListsPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const canCreate = user?.role === 'Admin' || user?.role === 'Designer';

    const listsRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'master_lists');
    }, [firestore]);

    const { data: masterLists, isLoading } = useCollection<MasterList>(listsRef);

    const handleDelete = (list: MasterList) => {
        if (!firestore) return;
        const docRef = doc(firestore, 'master_lists', list.id);
        deleteDocumentNonBlocking(docRef);
        // Note: This does not delete the sub-collection data. A Cloud Function would be needed for that.
        toast({
            title: "Lista Eliminada",
            description: `La definición de la lista "${list.name}" ha sido eliminada.`
        })
    }

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Listas Maestras</h1>
            <p className="text-muted-foreground">
              Gestione colecciones de datos reutilizables para sus procesos.
            </p>
          </div>
          {canCreate && (
            <Button asChild>
              <Link href="/master-lists/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nueva Lista
              </Link>
            </Button>
          )}
        </header>
        <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
             {isLoading && Array.from({ length: 3 }).map((_, i) => <TemplateSkeleton key={i} />)}
             {masterLists?.map((list) => (
                <Card key={list.id} className="flex flex-col">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                <Database className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1">
                                <CardTitle>{list.name}</CardTitle>
                                <CardDescription>{list.description}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                     <CardContent className="flex-grow">
                        <div className="text-sm font-medium">
                            {list.fields.length} campos definidos
                        </div>
                    </CardContent>
                     <CardFooter className="flex gap-2">
                        <Button asChild className="w-full">
                            <Link href={`/master-lists/${list.id}`}>Ver Datos</Link>
                        </Button>
                        {canCreate && (
                            <div className="flex">
                                <Button variant="outline" size="icon" asChild>
                                    <Link href={`/master-lists/edit/${list.id}`}>
                                        <Pencil className="h-4 w-4" />
                                    </Link>
                                </Button>
                                 <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción eliminará la definición de la lista, pero no borrará los datos existentes. Esta acción no se puede deshacer.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(list)} className="bg-destructive hover:bg-destructive/90">
                                            Eliminar
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                    </CardFooter>
                </Card>
             ))}
          </div>
            {!isLoading && masterLists?.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">No hay listas maestras</h3>
                        <p className="text-sm text-muted-foreground">Cree una nueva lista para empezar a gestionar datos.</p>
                        {canCreate && (
                            <Button className="mt-4" asChild>
                                <Link href="/master-lists/new">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Nueva Lista
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </main>
      </div>
    </SiteLayout>
  );
}

    