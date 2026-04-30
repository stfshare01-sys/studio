import { Pencil, Eye, EyeOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppModule, PermissionLevel } from "@/types/auth.types";

export function PermissionSelector({
  module,
  level,
  onChange,
  disabled,
}: {
  module: { id: AppModule; name: string; description: string };
  level: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex-1">
        <p className="font-medium text-sm">{module.name}</p>
        <p className="text-xs text-muted-foreground">{module.description}</p>
      </div>
      <Select value={level} onValueChange={(v) => onChange(v as PermissionLevel)} disabled={disabled}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="write">
            <div className="flex items-center gap-2">
              <Pencil className="h-3 w-3 text-green-600" />
              Escritura
            </div>
          </SelectItem>
          <SelectItem value="read">
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-blue-600" />
              Lectura
            </div>
          </SelectItem>
          <SelectItem value="hidden">
            <div className="flex items-center gap-2">
              <EyeOff className="h-3 w-3 text-gray-500" />
              Oculto
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
