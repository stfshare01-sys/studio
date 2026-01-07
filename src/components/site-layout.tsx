"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban,
  FilePlus,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/icons";
import { Button } from "./ui/button";
import { useAuth, useUser } from "@/firebase";
import { signOut } from "firebase/auth";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Panel" },
  { href: "/templates", icon: FolderKanban, label: "Plantillas" },
  { href: "/requests/new", icon: FilePlus, label: "Nueva Solicitud"},
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const displayName = user?.isAnonymous ? 'Usuario Anónimo' : (user?.displayName || user?.email || 'Usuario');
  const displayEmail = user?.isAnonymous ? 'Sesión de invitado' : (user?.email || '');


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link href="/"><Logo className="size-5" /></Link>
            </Button>
            <h2 className="text-lg font-semibold tracking-tight">FlowMaster</h2>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  className="w-full"
                >
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 border-t space-y-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              {user?.photoURL && <AvatarImage src={user.photoURL} alt={displayName} />}
              <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col text-sm truncate">
              <span className="font-semibold truncate">{displayName}</span>
              <span className="text-muted-foreground truncate">{displayEmail}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut} disabled={isUserLoading}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="md:hidden flex items-center p-2 border-b">
            <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
