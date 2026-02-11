
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
  Palette,
  Database,
  Briefcase,
  Shield,
  CheckSquare,
  Calendar,
} from "lucide-react";
import { Logo } from "@/components/icons";
import { Button } from "./ui/button";
import { useAuth, useUser } from "@/firebase";
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
import { StyleSelector } from "@/components/style-selector";
import { GlobalSearch } from "@/components/global-search";

import { usePermissions } from "@/hooks/use-permissions";
import type { AppModule } from "@/lib/types";

// Unified navigation configuration
type NavItem = {
  href: string;
  icon: any;
  label: string;
  module: AppModule;
  exact?: boolean;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Panel", module: "dashboard", exact: true },
  { href: "/tasks", icon: CheckSquare, label: "Buzón", module: "requests" },
  { href: "/hcm", icon: Briefcase, label: "Capital Humano", module: "hcm_employees" },
  { href: "/hcm/admin/vacation-management", icon: Calendar, label: "Gestión de Vacaciones", module: "hcm_employees" },
  { href: "/reports", icon: BarChart3, label: "Informes", module: "reports" },
  { href: "/process-mining", icon: Activity, label: "Minería de Procesos", module: "process_mining" },
  { href: "/hcm/team-management", icon: Users, label: "Gestión de Equipo", module: "hcm_team_management" },
  { href: "/templates", icon: FolderKanban, label: "Plantillas", module: "templates" },
  { href: "/master-lists", icon: Database, label: "Listas Maestras", module: "master_lists" },
  { href: "/requests/new", icon: FilePlus, label: "Nueva Solicitud", module: "requests" },
  { href: "/integrations", icon: Plug, label: "Integraciones", module: "integrations" },
  { href: "/admin/users", icon: Users, label: "Usuarios (Admin)", module: "admin_users" },
  { href: "/admin/roles", icon: Shield, label: "Roles y Permisos", module: "admin_roles" },
];

import { hasDirectReports } from "@/firebase/actions/team-actions";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isManager, setIsManager] = useState(false);

  // Checks if user has direct reports to show Team Management link
  useEffect(() => {
    if (user?.uid) {
      hasDirectReports(user.uid).then(setIsManager);
    }
  }, [user]);

  // Use the permissions hook for dynamic filtering
  const { canRead, isAdmin, isLoading: permissionsLoading } = usePermissions();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);


  const handleSignOut = async () => {
    if (auth) {
      try {
        await signOut(auth);
        // Navigation will occur automatically via useEffect when user becomes null
      } catch (error) {
        console.error("Error signing out:", error);
      }
    }
  };

  if (isUserLoading || !user || permissionsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  const displayName = user?.fullName || user?.email || 'Usuario';
  const displayEmail = user?.email || '';

  // Filter items based on permissions
  const navItems = ALL_NAV_ITEMS.filter(item => {
    // Admin sees everything (redundant check if hasPermission handles isAdmin, but good for clarity)
    if (isAdmin) return true;

    // Special check for Team Management based on actual reports
    if (item.href === '/hcm/team-management' && isManager) return true;

    // Check read permission for the module
    return canRead(item.module);
  });

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
                  isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
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
            <StyleSelector />
            <ThemeToggle />
            <NotificationCenter />
          </div>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
