"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  showFilters?: boolean;
}

export function TableSkeleton({
  columns = 4,
  rows = 5,
  showFilters = true,
}: TableSkeletonProps) {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando tabla...">
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-[180px]" />
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <TableCell key={colIndex}>
                    {colIndex === 0 ? (
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ) : (
                      <Skeleton className="h-4 w-20" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Skeleton className="h-4 w-48" />
      <span className="sr-only">Cargando datos de la tabla...</span>
    </div>
  );
}
