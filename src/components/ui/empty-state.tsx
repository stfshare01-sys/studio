"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FileQuestion,
  FolderOpen,
  Inbox,
  Search,
  Users,
  FileText,
  Calendar,
  type LucideIcon,
} from "lucide-react";

export type EmptyStateVariant =
  | "default"
  | "search"
  | "folder"
  | "inbox"
  | "users"
  | "documents"
  | "calendar";

const VARIANT_ICONS: Record<EmptyStateVariant, LucideIcon> = {
  default: FileQuestion,
  search: Search,
  folder: FolderOpen,
  inbox: Inbox,
  users: Users,
  documents: FileText,
  calendar: Calendar,
};

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  variant?: EmptyStateVariant;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: "default" | "outline" | "secondary";
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  title = "No hay datos",
  description = "No se encontraron registros para mostrar.",
  icon,
  variant = "default",
  actionLabel,
  onAction,
  actionVariant = "default",
  secondaryActionLabel,
  onSecondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  const IconComponent = icon || VARIANT_ICONS[variant];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-16 px-8",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-muted flex items-center justify-center",
          compact ? "h-12 w-12 mb-3" : "h-16 w-16 mb-4"
        )}
      >
        <IconComponent
          className={cn(
            "text-muted-foreground",
            compact ? "h-6 w-6" : "h-8 w-8"
          )}
        />
      </div>

      <h3
        className={cn(
          "font-semibold text-foreground",
          compact ? "text-base mb-1" : "text-lg mb-2"
        )}
      >
        {title}
      </h3>

      <p
        className={cn(
          "text-muted-foreground max-w-sm",
          compact ? "text-sm" : "text-sm"
        )}
      >
        {description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div className={cn("flex gap-2", compact ? "mt-4" : "mt-6")}>
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </Button>
          )}
          {actionLabel && onAction && (
            <Button
              variant={actionVariant}
              size={compact ? "sm" : "default"}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Preset empty states for common use cases
export function SearchEmptyState({
  searchTerm,
  onClear,
}: {
  searchTerm?: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      variant="search"
      title="Sin resultados"
      description={
        searchTerm
          ? `No se encontraron resultados para "${searchTerm}".`
          : "No se encontraron resultados con los filtros aplicados."
      }
      actionLabel={onClear ? "Limpiar búsqueda" : undefined}
      onAction={onClear}
      actionVariant="outline"
    />
  );
}

export function NoDataEmptyState({
  entityName = "registros",
  onAdd,
  addLabel,
}: {
  entityName?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <EmptyState
      variant="inbox"
      title={`No hay ${entityName}`}
      description={`Aún no se han creado ${entityName}. Comienza agregando el primero.`}
      actionLabel={addLabel || `Agregar ${entityName}`}
      onAction={onAdd}
    />
  );
}
