
"use client";

import React, { useState, useMemo } from "react";
import type { User, UserRole } from "@/lib/types";
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
import { MoreHorizontal, Trash2, Edit, Search, ArrowUpDown, ChevronDown } from "lucide-react";
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
} from "@/components/ui/alert-dialog";


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

type SortField = "fullName" | "department" | "role";
type SortOrder = "asc" | "desc";

export function UsersTable({ users }: { users: User[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState("");
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

        // Filtrar por búsqueda
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(u =>
                u.fullName.toLowerCase().includes(term) ||
                u.email.toLowerCase().includes(term)
            );
        }

        // Filtrar por rol
        if (roleFilter !== "all") {
            result = result.filter(u => u.role === roleFilter);
        }

        // Filtrar por departamento
        if (departmentFilter !== "all") {
            result = result.filter(u => u.department === departmentFilter);
        }

        // Ordenar
        result.sort((a, b) => {
            let comparison = 0;

            if (sortField === "fullName") {
                comparison = a.fullName.localeCompare(b.fullName);
            } else if (sortField === "department") {
                comparison = a.department.localeCompare(b.department);
            } else if (sortField === "role") {
                comparison = (a.role || 'Member').localeCompare(b.role || 'Member');
            }

            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [users, searchTerm, roleFilter, departmentFilter, sortField, sortOrder]);

    // Paginated results
    const paginatedUsers = useMemo(() => {
        return filteredAndSortedUsers.slice(0, displayCount);
    }, [filteredAndSortedUsers, displayCount]);

    const hasMore = displayCount < filteredAndSortedUsers.length;

    const loadMore = () => {
        setDisplayCount(prev => prev + PAGE_SIZE);
    };

    // Reset pagination when filters change
    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        setDisplayCount(PAGE_SIZE);
    };

    const handleRoleFilterChange = (value: string) => {
        setRoleFilter(value);
        setDisplayCount(PAGE_SIZE);
    };

    const handleDepartmentFilterChange = (value: string) => {
        setDepartmentFilter(value);
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

    const handleDeleteUser = (userId: string) => {
        if (!firestore) return;
        const userRef = doc(firestore, 'users', userId);
        deleteDocumentNonBlocking(userRef);
        toast({
            variant: "destructive",
            title: "Usuario Eliminado",
            description: "El usuario ha sido eliminado del sistema.",
        })
    }

  return (
    <>
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Member">Miembro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={handleDepartmentFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtrar por depto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los deptos</SelectItem>
            {departments.map(dept => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resultados */}
      {filteredAndSortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
          <p className="text-muted-foreground">No se encontraron usuarios</p>
          {(searchTerm || roleFilter !== "all" || departmentFilter !== "all") && (
            <Button
              variant="link"
              onClick={() => { setSearchTerm(""); setRoleFilter("all"); setDepartmentFilter("all"); }}
            >
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => toggleSort("fullName")}
                  >
                    Usuario
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => toggleSort("department")}
                  >
                    Departamento
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => toggleSort("role")}
                  >
                    Rol
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow key={user.id}>
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
                    <Badge variant={user.role === 'Admin' ? 'destructive' : 'secondary'}>
                      {user.role || 'Member'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-haspopup="true" size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => handleEditClick(user)}>
                            <Edit className="mr-2 h-4 w-4"/>
                            Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" className="w-full justify-start text-sm text-red-500 hover:text-red-500 hover:bg-red-500/10 font-normal px-2 py-1.5 relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                    <Trash2 className="mr-2 h-4 w-4"/>
                                    Eliminar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Esto eliminará permanentemente
                                    la cuenta del usuario y sus datos de nuestros servidores.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteUser(user.id)} className="bg-destructive hover:bg-destructive/90">
                                    Sí, eliminar usuario
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Cargar más */}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} className="gap-2">
            <ChevronDown className="h-4 w-4" />
            Cargar más
          </Button>
        </div>
      )}

      {/* Contador de resultados */}
      <p className="text-sm text-muted-foreground">
        Mostrando {paginatedUsers.length} de {filteredAndSortedUsers.length} usuarios
        {filteredAndSortedUsers.length !== users.length && ` (${users.length} total)`}
      </p>
    </div>
    {selectedUser && (
        <EditUserDialog
            user={selectedUser}
            isOpen={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            onUserUpdate={() => {
                // This is a placeholder to trigger a re-fetch if needed.
                // For now, local state updates immediately.
            }}
        />
    )}
    </>
  );
}
