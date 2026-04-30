import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

/**
 * Formatea una fecha YYYY-MM-DD o ISO string a "dd MMM yyyy" en español.
 * Maneja strings inválidos devolviendo el valor original como fallback.
 */
export function formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    try {
        return format(parseISO(dateStr), 'dd MMM yyyy', { locale: es });
    } catch {
        return dateStr;
    }
}

/**
 * Devuelve un Badge con el color y texto correspondiente al estado de un registro de prenómina.
 */
export function getStatusBadge(status: string) {
    switch (status) {
        case 'locked':
            return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
        case 'exported':
            return <Badge className="bg-purple-100 text-purple-800">Exportado</Badge>;
        case 'reviewed':
            return <Badge className="bg-green-100 text-green-800">Revisado</Badge>;
        case 'draft':
        default:
            return <Badge className="bg-gray-100 text-gray-800">Borrador</Badge>;
    }
}
