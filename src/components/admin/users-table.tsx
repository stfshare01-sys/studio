
"use client";

import React, { useState, useMemo } from "react";
import type { User, UserRole, UserStatus } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { MoreHorizontal, Trash2, Edit, Search, ArrowUpDown, ChevronDown, UserCheck, UserX, Ban } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toggleUserStatus } from "@/firebase/admin-actions";

function EditUserDialog({ user, isOpen, onOpenChange, onUserUpdate }: { user: User, isOpen: boolean, onOpenChange: (open: boolean) => void, onUserUpdate: () => void }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        fullName: user.fullName,
        department: user.department,
        role: user.role || 'Member',
    });

    React.useEffect(() => {
        setFormData({
            fullName: user.fullName,
            department: user.department,
            role: user.role || 'Member',
        });
    }, [user]);

    const handleInputChange = (id: string, value: string) => {
        setFormData(prev => ({...prev, [id]: value}));
    };

    const handleSave = () => {
        if (!firestore) return;
        const userRef = doc(firestore, 'users', user.id);
        updateDocumentNonBlocking(userRef, formData);
        toast({
            title: "Usuario actualizado",
            description: `Los datos de ${user.fullName} han sido actualizados.`,
        });
        onUserUpdate();
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Usuario</DialogTitle>
                    <DialogDescription>
                        Realice cambios en el perfil de {user.fullName}.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                        <Label htmlFor="fullName" className="sm:text-right">
                            Nombre
                        </Label>
                        <Input id="fullName" value={formData.fullName} onChange={(e) => handleInputChange('fullName', e.target.value)} className="sm:col-span-3" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                        <Label htmlFor="department" className="sm:text-right">
                            Departamento
                        </Label>
                        <Input id="department" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} className="sm:col-span-3" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                        <Label htmlFor="role" className="sm:text-right">
                            Rol
                        </Label>
                         <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value as UserRole)}>
                            <SelectTrigger className="sm:col-span-3">
                                <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Admin">Admin</SelectItem>
                                <SelectItem value="Member">Miembro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                    <DialogClose asChild>
                        <Button variant="outline" className="w-full sm:w-auto">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleSave} className="w-full sm:w-auto">Guardar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const PAGE_SIZE = 10;

type SortField = "fullName" | "department" | "role" | "status";
type SortOrder = "asc" | "desc";

export function UsersTable({ users }: { users: User[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [roleFilter, setRoleFilter] = useState<string>("all");
    const [departmentFilter, setDepartmentFilter] = useState<string>("all");
    const [sortField, setSortField] = useState<SortField>("fullName");
    const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

    // Obtener departamentos únicos
    const departments = useMemo(() => {
        const depts = new Set(users.map(u => u.department));
        return Array.from(depts).sort();
    }, [users]);

    // Filtrar y ordenar
    const filteredAndSortedUsers = useMemo(() => {
        let result = [...users];

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(u =>
                u.fullName.toLowerCase().includes(term) ||
                u.email.toLowerCase().includes(term)
            );
        }

        if (statusFilter !== "all") {
            result = result.filter(u => (u.status || 'active') === statusFilter);
        }
        if (roleFilter !== "all") {
            result = result.filter(u => u.role === roleFilter);
        }
        if (departmentFilter !== "all") {
            result = result.filter(u => u.department === departmentFilter);
        }

        result.sort((a, b) => {
            let comparison = 0;
            const valA = a[sortField] || (sortField === 'status' ? 'active' : '');
            const valB = b[sortField] || (sortField === 'status' ? 'active' : '');
            comparison = String(valA).localeCompare(String(valB));
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [users, searchTerm, roleFilter, statusFilter, departmentFilter, sortField, sortOrder]);

    const paginatedUsers = useMemo(() => {
        return filteredAndSortedUsers.slice(0, displayCount);
    }, [filteredAndSortedUsers, displayCount]);

    const hasMore = displayCount < filteredAndSortedUsers.length;

    const loadMore = () => setDisplayCount(prev => prev + PAGE_SIZE);

    const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
        setter(value);
        setDisplayCount(PAGE_SIZE);
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
    };

    const handleEditClick = (user: User) => {
        setSelectedUser(user);
        setIsEditDialogOpen(true);
    };

    const handleToggleStatus = async (user: User) => {
        const newStatus = (user.status || 'active') === 'active' ? 'disabled' : 'active';
        try {
            await toggleUserStatus(user.id, newStatus === 'active');
            toast({
                title: `Usuario ${newStatus === 'active' ? 'Habilitado' : 'Deshabilitado'}`,
                description: `${user.fullName} ha sido ${newStatus === 'active' ? 'habilitado' : 'deshabilitado'}.`,
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al actualizar estado",
                description: error.message || "No se pudo cambiar el estado del usuario.",
            })
        }
    }


  return (
    <TooltipProvider>
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o email..." value={searchTerm} onChange={(e) => handleFilterChange(setSearchTerm)(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="disabled">Deshabilitado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={handleFilterChange(setRoleFilter)}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Filtrar por rol" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Member">Miembro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredAndSortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
          <p className="text-muted-foreground">No se encontraron usuarios</p>
          {(searchTerm || roleFilter !== "all" || departmentFilter !== "all") && (
            <Button variant="link" onClick={() => { setSearchTerm(""); setRoleFilter("all"); setDepartmentFilter("all"); setStatusFilter("all"); }}>
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort("fullName")}>
                    Usuario <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort("department")}>
                    Departamento <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort("status")}>
                    Estado <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow key={user.id} className={cn((user.status || 'active') === 'disabled' && 'opacity-50')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                            <AvatarFallback>{user.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="grid">
                            <div className="font-medium">{user.fullName}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {user.department}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                        <Badge variant={(user.status || 'active') === 'active' ? 'secondary' : 'outline'} className={cn((user.status || 'active') === 'active' ? 'bg-green-100 text-green-800' : 'text-muted-foreground')}>
                            {(user.status || 'active') === 'active' ? 'Activo' : 'Deshabilitado'}
                        </Badge>
                        {user.role === 'Admin' && <Badge variant={'destructive'}>Admin</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)} className="h-8 w-8">
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Editar</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Editar Usuario</p></TooltipContent>
                        </Tooltip>
                        {(user.status || 'active') === 'active' ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(user)} className="h-8 w-8 text-yellow-600 hover:text-yellow-700">
                                        <UserX className="h-4 w-4" />
                                        <span className="sr-only">Desactivar</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Desactivar Usuario</p></TooltipContent>
                            </Tooltip>
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                     <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(user)} className="h-8 w-8 text-green-600 hover:text-green-700">
                                        <UserCheck className="h-4 w-4" />
                                        <span className="sr-only">Activar</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Activar Usuario</p></TooltipContent>
                            </Tooltip>
                        )}
                         <Tooltip>
                            <TooltipTrigger asChild>
                                <Button disabled variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Eliminar (deshabilitado)</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>La eliminación permanente está deshabilitada por seguridad.</p></TooltipContent>
                        </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} className="gap-2">
            <ChevronDown className="h-4 w-4" /> Cargar más
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Mostrando {paginatedUsers.length} de {filteredAndSortedUsers.length} usuarios</p>
    </div>
    {selectedUser && (
        <EditUserDialog user={selectedUser} isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} onUserUpdate={() => {}} />
    )}
    </TooltipProvider>
  );
}
