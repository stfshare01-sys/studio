import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, Users } from "lucide-react";
import type { Role, AppModule, ModulePermission, PermissionLevel, SystemRole } from '@/types/auth.types';
import { calculateSystemLevel, SYSTEM_LEVEL_CONFIG } from "@/lib/permissions-config";
import { MODULE_INFO } from "@/firebase/role-actions";
import { MODULES_BY_CATEGORY } from "../utils/role-constants";
import { PermissionSelector } from "./permission-selector";

export type RoleDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  onSave: (data: { name: string; description: string; permissions: ModulePermission[]; systemLevel?: SystemRole; hierarchyDepth?: number }) => Promise<void>;
  isSaving: boolean;
  isAdmin?: boolean;
};

export function RoleDialog({ isOpen, onOpenChange, role, onSave, isSaving, isAdmin = false }: RoleDialogProps) {
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [hierarchyDepth, setHierarchyDepth] = useState<number | 'infinite'>(role?.hierarchyDepth ?? 'infinite');
  const [permissions, setPermissions] = useState<Record<AppModule, PermissionLevel>>(() => {
    const initial: Record<string, PermissionLevel> = {};
    Object.keys(MODULE_INFO).forEach((moduleId) => {
      const existing = role?.permissions.find((p) => p.module === moduleId);
      initial[moduleId] = existing?.level || "hidden";
    });
    return initial as Record<AppModule, PermissionLevel>;
  });

  // Calculate system level live
  const [detectedLevel, setDetectedLevel] = useState<SystemRole>('Member');
  const [manualOverride, setManualOverride] = useState<SystemRole | null>(null);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  // Reset form when role changes
  useEffect(() => {
    setName(role?.name || "");
    setDescription(role?.description || "");
    setHierarchyDepth(role?.hierarchyDepth ?? 'infinite');
    const initial: Record<string, PermissionLevel> = {};
    Object.keys(MODULE_INFO).forEach((moduleId) => {
      const existing = role?.permissions.find((p) => p.module === moduleId);
      initial[moduleId] = existing?.level || "hidden";
    });
    setPermissions(initial as Record<AppModule, PermissionLevel>);
    setManualOverride(null);
    setIsAdvancedMode(false);
  }, [role]);

  // Recalculate system level when permissions change
  useEffect(() => {
    const permissionsList: ModulePermission[] = Object.entries(permissions).map(
      ([module, level]) => ({ module: module as AppModule, level })
    );
    const calculated = calculateSystemLevel(permissionsList);
    setDetectedLevel(calculated);
  }, [permissions]);

  const handlePermissionChange = (moduleId: AppModule, level: PermissionLevel) => {
    setPermissions((prev) => ({ ...prev, [moduleId]: level }));
  };

  const handleSave = async () => {
    const permissionsList: ModulePermission[] = Object.entries(permissions).map(
      ([module, level]) => ({ module: module as AppModule, level })
    );
    await onSave({
      name,
      description,
      permissions: permissionsList,
      systemLevel: manualOverride || detectedLevel,
      hierarchyDepth: hierarchyDepth === 'infinite' ? undefined : hierarchyDepth
    });
  };

  const isEditing = !!role;
  const isSystemRoleEdit = role?.isSystemRole || false;
  // Admins can edit system roles, others cannot
  const canEdit = isAdmin || !isSystemRoleEdit;

  const effectiveLevel = manualOverride || detectedLevel;
  const levelInfo = SYSTEM_LEVEL_CONFIG[effectiveLevel];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Rol" : "Crear Nuevo Rol"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? isSystemRoleEdit
                ? isAdmin
                  ? "Editando rol del sistema (Solo administradores)."
                  : "Los roles del sistema no pueden ser modificados."
                : "Modifica los permisos de este rol personalizado."
              : "Define un nuevo rol con permisos específicos para cada módulo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Rol</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Supervisor de Ventas"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe las responsabilidades de este rol..."
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label htmlFor="hierarchyDepth" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Alcance Jerárquico
                <Badge variant="outline" className="text-[10px] h-5 ml-1 bg-blue-50 text-blue-700 border-blue-200">HCM</Badge>
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Define qué tan profundo en la estructura organizacional este rol puede ver y gestionar personal subordinado.
              </p>
              <Select
                value={hierarchyDepth.toString()}
                onValueChange={(v) => setHierarchyDepth(v === 'infinite' ? 'infinite' : parseInt(v))}
                disabled={!canEdit}
              >
                <SelectTrigger id="hierarchyDepth" className="w-full">
                  <SelectValue placeholder="Selecciona el alcance jerárquico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Nivel 1 (Solo reportes directos directos)</SelectItem>
                  <SelectItem value="2">Nivel 2 (Reportes directos + sus reportes)</SelectItem>
                  <SelectItem value="3">Nivel 3 (3 Niveles por debajo)</SelectItem>
                  <SelectItem value="infinite">Global (Toda la cadena de mando sin límite)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* System Level Detection */}
          {!isSystemRoleEdit && (
            <Alert className={manualOverride ? "border-yellow-500/50 bg-yellow-500/10" : "bg-muted/50"}>
              <Shield className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                Nivel de Sistema: <Badge variant={manualOverride ? "secondary" : "outline"} className={manualOverride ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100" : ""}>{effectiveLevel}</Badge>
                {manualOverride && <span className="text-xs text-muted-foreground">(Manual)</span>}
              </AlertTitle>
              <AlertDescription className="mt-2 text-xs text-muted-foreground">
                {manualOverride
                  ? "Has anulado manualmente el nivel detectado. Asegúrate de que esto sea correcto."
                  : `Detectado automáticamente basado en los permisos seleccionados. Este nivel determina las reglas de seguridad de Firestore.`
                }
                <div className="mt-1 font-medium">{levelInfo?.description}</div>
              </AlertDescription>

              <div className="mt-2">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                >
                  {isAdvancedMode ? "Ocultar opciones avanzadas" : "Opciones avanzadas (Override)"}
                </Button>
              </div>

              {isAdvancedMode && (
                <div className="mt-2 pt-2 border-border/50">
                  <Label className="text-xs mb-1.5 block">Forzar Nivel de Sistema</Label>
                  <Select
                    value={manualOverride || "auto"}
                    onValueChange={(v) => setManualOverride(v === "auto" ? null : v as SystemRole)}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático ({detectedLevel})</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="HRManager">HRManager</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </Alert>
          )}

          {/* Permissions */}
          <div className="space-y-4">
            <Label>Permisos por Módulo</Label>
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="admin">Administración</TabsTrigger>
                <TabsTrigger value="hcm">HCM</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.general.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={!canEdit}
                  />
                ))}
              </TabsContent>

              <TabsContent value="admin" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.admin.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={!canEdit}
                  />
                ))}
              </TabsContent>

              <TabsContent value="hcm" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.hcm.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={!canEdit}
                  />
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              {isSaving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Rol"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
