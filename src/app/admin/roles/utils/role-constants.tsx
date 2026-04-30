import { Pencil, Eye, EyeOff } from "lucide-react";
import type { PermissionLevel, AppModule } from "@/types/auth.types";
import { MODULE_INFO } from "@/firebase/role-actions";

export const PERMISSION_COLORS: Record<PermissionLevel, string> = {
  write: "bg-green-500/10 text-green-600 border-green-500/20",
  read: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  hidden: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  write: "Escritura",
  read: "Lectura",
  hidden: "Oculto",
};

export const PERMISSION_ICONS: Record<PermissionLevel, React.ReactNode> = {
  write: <Pencil className="h-3 w-3" />,
  read: <Eye className="h-3 w-3" />,
  hidden: <EyeOff className="h-3 w-3" />,
};

export const MODULES_BY_CATEGORY = {
  general: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "general")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
  admin: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "admin")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
  hcm: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "hcm")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
};
