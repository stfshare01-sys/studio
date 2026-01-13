
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
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban,
  FilePlus,
  LayoutDashboard,
  LogOut,
  Users,
  BarChart3,
  Plug,
  Activity,
} from "lucide-react";
import { Logo } from "@/components/icons";
import { Button } from "./ui/button";
import { useAuth, useUser } from "@/firebase";
import { signOut } from "firebase/auth";
import { useEffect } from "react";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalSearch } from "@/components/global-search";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Panel" },
  { href: "/reports", icon: BarChart3, label: "Informes" },
  { href: "/process-mining", icon: Activity, label: "Minería de Procesos" },
  { href: "/templates", icon: FolderKanban, label: "Plantillas" },
  { href: "/requests/new", icon: FilePlus, label: "Nueva Solicitud"},
  { href: "/integrations", icon: Plug, label: "Integraciones" },
];

const adminNavItems = [
    { href: "/admin/users", icon: Users, label: "Usuarios" },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);


  const handleSignOut = async () => {
    if (auth) {
        await signOut(auth);
        router.replace('/login');
    }
  };
  
  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  const displayName = user?.fullName || user?.email || 'Usuario';
  const displayEmail = user?.email || '';
  const isAdmin = user?.role === 'Admin';


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
            {isAdmin && adminNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
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
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
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
        <div className="flex items-center justify-between p-2 border-b md:border-b-0">
            <div className="md:hidden">
                <SidebarTrigger />
            </div>
            <div className="flex items-center gap-1 ml-auto">
                <GlobalSearch />
                <ThemeToggle />
                <NotificationCenter />
            </div>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
