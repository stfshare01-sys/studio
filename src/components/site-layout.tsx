
"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
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
  BookOpen,
  ChevronsUpDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type NavGroup = {
  label: string;
  items: NavItem[];
};

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Panel", module: "dashboard", exact: true },
  // { href: "/tasks", icon: CheckSquare, label: "Buzón", module: "requests" }, // Oculto temporalmente
  { href: "/hcm", icon: Briefcase, label: "Capital Humano", module: "hcm_employees" },
  { href: "/reports", icon: BarChart3, label: "Informes", module: "reports" },
  { href: "/process-mining", icon: Activity, label: "Minería de Procesos", module: "process_mining" },
  { href: "/templates", icon: FolderKanban, label: "Plantillas", module: "templates" },
  { href: "/master-lists", icon: Database, label: "Listas Maestras", module: "master_lists" },
  { href: "/requests/new", icon: FilePlus, label: "Nueva Solicitud", module: "requests" },
  { href: "/biblioteca", icon: BookOpen, label: "Biblioteca", module: "org_documents" },
  { href: "/integrations", icon: Plug, label: "Integraciones", module: "integrations" },
  { href: "/admin/users", icon: Users, label: "Usuarios (Admin)", module: "admin_users" },
  { href: "/admin/roles", icon: Shield, label: "Roles y Permisos", module: "admin_roles" },
];

// Group definitions for sidebar — order matters
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Panel", module: "dashboard", exact: true },
      // { href: "/tasks", icon: CheckSquare, label: "Buzón", module: "requests" }, // Oculto temporalmente
    ],
  },
  {
    label: "Módulos",
    items: [
      { href: "/hcm", icon: Briefcase, label: "Capital Humano", module: "hcm_employees" },
      { href: "/reports", icon: BarChart3, label: "Informes", module: "reports" },
      { href: "/process-mining", icon: Activity, label: "Minería de Procesos", module: "process_mining" },
      { href: "/templates", icon: FolderKanban, label: "Plantillas", module: "templates" },
      { href: "/master-lists", icon: Database, label: "Listas Maestras", module: "master_lists" },
      { href: "/requests/new", icon: FilePlus, label: "Nueva Solicitud", module: "requests" },
      { href: "/biblioteca", icon: BookOpen, label: "Biblioteca", module: "org_documents" },
      { href: "/integrations", icon: Plug, label: "Integraciones", module: "integrations" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/admin/users", icon: Users, label: "Usuarios", module: "admin_users" },
      { href: "/admin/roles", icon: Shield, label: "Roles y Permisos", module: "admin_roles" },
    ],
  },
];

import { hasDirectReports } from "@/firebase/actions/team-actions";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isManager, setIsManager] = useState(false);

  // Checks if user has direct reports to show Team Management link
  // Only check for roles that have permission to list employees
  useEffect(() => {
    const canCheckReports = user?.role && ['Manager', 'HRManager', 'Admin'].includes(user.role);
    if (user?.uid && canCheckReports) {
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

    // If it's the root HCM nav item, check if ANY HCM sub-module is visible
    if (item.href === '/hcm') {
      return canRead('hcm_employees') || canRead('hcm_attendance') ||
        canRead('hcm_incidences') || canRead('hcm_prenomina') ||
        canRead('hcm_calendar') || canRead('hcm_org_chart');
    }

    // Check read permission for the module
    return canRead(item.module);
  });

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">STUFFACTORY</h2>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(item => navItems.some(n => n.href === item.href));
            if (visibleItems.length === 0) return null;
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="nav-group-label">{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                          className="w-full"
                          size="default"
                        >
                          <Link href={item.href}>
                            <item.icon className="size-5 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
                {gi < NAV_GROUPS.length - 1 && <SidebarSeparator className="mt-2" />}
              </SidebarGroup>
            );
          })}
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="overflow-x-hidden min-w-0">
        <div className="flex items-center justify-between p-3 md:px-6 md:py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 sticky top-0">
          <div className="flex items-center">
            <SidebarTrigger className="md:hidden mr-2" />
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-1 md:gap-2 mr-2">
              <StyleSelector />
              <ThemeToggle />
              <NotificationCenter />
            </div>

            {/* Perfil de Usuario en el Header */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto p-1.5 flex items-center gap-3 rounded-full hover:bg-muted/60 transition-colors">
                  <Avatar className="h-12 w-12 md:h-14 md:w-14 shrink-0 border border-primary/20 shadow-sm">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">{displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="hidden md:grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-foreground">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
                  </div>
                  <ChevronsUpDown className="size-4 text-muted-foreground hidden md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 rounded-xl shadow-lg border-muted"
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-3 px-2 py-3 text-left text-sm bg-muted/30">
                    <Avatar className="h-10 w-10 shrink-0">
                      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
                      <AvatarFallback className="bg-primary/10 text-primary">{displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950 p-3 rounded-lg mx-1 mb-1">
                  <LogOut className="mr-2 size-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="main-content-area overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
