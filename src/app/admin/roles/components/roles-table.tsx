import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Trash2, Users, Lock } from "lucide-react";
import type { Role, ModulePermission } from '@/types/auth.types';
import { PERMISSION_COLORS, PERMISSION_ICONS } from "../utils/role-constants";
import { Skeleton } from "@/components/ui/skeleton";

type RolesTableProps = {
  roles: Role[];
  isLoading: boolean;
  onEditRole: (role: Role) => void;
  onDeleteRole: (roleId: string) => void;
};

export function RolesTableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function RolesTable({ roles, isLoading, onEditRole, onDeleteRole }: RolesTableProps) {
  const countPermissions = (permissions: ModulePermission[]) => {
    const counts = { write: 0, read: 0, hidden: 0 };
    permissions.forEach((p) => counts[p.level]++);
    return counts;
  };

  if (isLoading) {
    return <RolesTableSkeleton />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rol</TableHead>
          <TableHead>Nivel de Sistema</TableHead>
          <TableHead>Jerarquía</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Permisos</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => {
          const counts = countPermissions(role.permissions);
          return (
            <TableRow key={role.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {role.isSystemRole ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Users className="h-4 w-4 text-muted-foreground" />
                  )}
                  {role.name}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{role.systemLevel || 'Member'}</Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium text-muted-foreground">
                  {role.hierarchyDepth === undefined ? 'Global' : `Nivel ${role.hierarchyDepth}`}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground max-w-xs truncate">
                {role.description}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {counts.write > 0 && (
                    <Badge variant="outline" className={PERMISSION_COLORS.write}>
                      {PERMISSION_ICONS.write}
                      <span className="ml-1">{counts.write}</span>
                    </Badge>
                  )}
                  {counts.read > 0 && (
                    <Badge variant="outline" className={PERMISSION_COLORS.read}>
                      {PERMISSION_ICONS.read}
                      <span className="ml-1">{counts.read}</span>
                    </Badge>
                  )}
                  {counts.hidden > 0 && (
                    <Badge variant="outline" className={PERMISSION_COLORS.hidden}>
                      {PERMISSION_ICONS.hidden}
                      <span className="ml-1">{counts.hidden}</span>
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={role.isSystemRole ? "secondary" : "outline"}>
                  {role.isSystemRole ? "Sistema" : "Personalizado"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditRole(role)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!role.isSystemRole && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDeleteRole(role.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
