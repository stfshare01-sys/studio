
"use client";

import React, { useState } from "react";
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
import { MoreHorizontal, Trash2, Edit } from "lucide-react";
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Usuario</DialogTitle>
                    <DialogDescription>
                        Realice cambios en el perfil de {user.fullName}.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="fullName" className="text-right">
                            Nombre
                        </Label>
                        <Input id="fullName" value={formData.fullName} onChange={(e) => handleInputChange('fullName', e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="department" className="text-right">
                            Departamento
                        </Label>
                        <Input id="department" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="role" className="text-right">
                            Rol
                        </Label>
                         <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value as UserRole)}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Admin">Admin</SelectItem>
                                <SelectItem value="Member">Miembro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export function UsersTable({ users }: { users: User[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead className="hidden sm:table-cell">Departamento</TableHead>
            <TableHead className="hidden md:table-cell">Rol</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
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
