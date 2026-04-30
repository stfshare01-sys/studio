
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"

// This component will be used to render the actions for each row
import { DataTableRowActions } from "./data-table-row-actions"
import type { MasterListField } from "@/types/common.types";

export const columns = (fields: MasterListField[]): ColumnDef<any>[] => {
  
  const generatedColumns: ColumnDef<any>[] = fields.map(field => ({
    accessorKey: field.id,
    header: field.label,
    cell: ({ row }) => {
      const value = row.getValue(field.id)
      
      switch (field.type) {
        case 'date':
          return value ? format(new Date(value as string), "PP", { locale: es }) : null
        case 'boolean':
          return <Badge variant={value ? "secondary" : "outline"}>{value ? "Sí" : "No"}</Badge>
        case 'number':
           return <div className="text-right">{new Intl.NumberFormat().format(value as number)}</div>
        default:
          return <span className="truncate">{value as string}</span>
      }
    },
  }))
  
  // Add the actions column at the end
  generatedColumns.push({
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  })

  return generatedColumns
}
