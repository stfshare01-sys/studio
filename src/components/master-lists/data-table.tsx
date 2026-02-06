"use client"

import * as React from "react"
import { useState } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase"
import { collection } from "firebase/firestore"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableSkeleton } from "@/components/ui/table-skeleton"
import { PlusCircle } from "lucide-react"
import type { MasterList } from "@/lib/types"
import { RecordFormDialog } from "./record-form-dialog"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  listId: string,
  listDef: MasterList
}

// Context to share edit/delete functionality with row actions
export const DataTableContext = React.createContext<{
  listId: string
  listDef: MasterList
  onEditRecord: (record: any) => void
  onDeleteRecord: (record: any) => void
} | null>(null)

export function DataTable<TData, TValue>({
  columns,
  listId,
  listDef,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [deletingRecord, setDeletingRecord] = useState<any>(null)
  const firestore = useFirestore();

  const dataRef = useMemoFirebase(() => {
    if (!firestore || !listId) return null;
    // Acceder a la subcolección 'records' dentro del documento master_data/{listId}
    return collection(firestore, 'master_data', listId, 'records');
  }, [firestore, listId]);

  const { data, isLoading } = useCollection<TData>(dataRef);

  const table = useReactTable({
    data: data || [],
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleEditRecord = (record: any) => {
    setEditingRecord(record)
  }

  const handleDeleteRecord = async (record: any) => {
    setDeletingRecord(record)
  }

  if (isLoading) {
    return <TableSkeleton columns={listDef.fields.length + 1} rows={5} />
  }

  return (
    <DataTableContext.Provider value={{
      listId,
      listDef,
      onEditRecord: handleEditRecord,
      onDeleteRecord: handleDeleteRecord
    }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Input
            placeholder="Buscar en todos los campos..."
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(String(event.target.value))}
            className="max-w-sm"
          />
          <div className="flex gap-2">
            <Button variant="outline" disabled>Importar (Próximamente)</Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Registro
            </Button>
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No hay resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add Record Dialog */}
        <RecordFormDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          listId={listId}
          listDef={listDef}
          record={null}
        />

        {/* Edit Record Dialog */}
        <RecordFormDialog
          open={!!editingRecord}
          onOpenChange={(open) => !open && setEditingRecord(null)}
          listId={listId}
          listDef={listDef}
          record={editingRecord}
        />

        {/* Delete Confirmation Dialog */}
        {deletingRecord && (
          <DeleteConfirmDialog
            open={!!deletingRecord}
            onOpenChange={(open) => !open && setDeletingRecord(null)}
            listId={listId}
            record={deletingRecord}
          />
        )}
      </div>
    </DataTableContext.Provider>
  )
}

// Delete Confirmation Dialog Component
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { doc, deleteDoc } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

function DeleteConfirmDialog({
  open,
  onOpenChange,
  listId,
  record
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  listId: string
  record: any
}) {
  const firestore = useFirestore()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!firestore || !record?.id) return

    setIsDeleting(true)
    try {
      const recordRef = doc(firestore, 'master_data', listId, 'records', record.id)
      await deleteDoc(recordRef)

      toast({
        title: "Registro eliminado",
        description: "El registro ha sido eliminado correctamente."
      })

      onOpenChange(false)
    } catch (error) {
      console.error("Error deleting record:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar el registro. Intente nuevamente.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El registro será eliminado permanentemente de la lista maestra.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
