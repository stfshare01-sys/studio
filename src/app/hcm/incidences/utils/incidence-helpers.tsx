import { Badge } from '@/components/ui/badge';
import type { IncidenceType, IncidenceStatus } from "@/types/hcm.types";
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

export const getTypeLabel = (type: IncidenceType): string => {
    const labels: Record<IncidenceType, string> = {
        vacation: 'Vacaciones',
        sick_leave: 'Incapacidad',
        personal_leave: 'Permiso Personal',
        maternity: 'Maternidad',
        paternity: 'Paternidad',
        bereavement: 'Duelo',
        marriage: 'Matrimonio',
        adoption: 'Adopción',
        civic_duty: 'Deber Cívico',
        half_day_family: 'Permiso Medio Día',
        unpaid_leave: 'Permiso Sin Goce',
        unjustified_absence: 'Falta Injustificada',
        abandono_empleo: 'Abandono de Empleo',
        home_office: 'Home Office'
    };
    return labels[type] || type;
};

export const getStatusBadge = (status: IncidenceStatus) => {
    switch (status) {
        case 'approved':
            return <Badge className="bg-green-100 text-green-800">Aprobada</Badge>;
        case 'rejected':
            return <Badge variant="destructive">Rechazada</Badge>;
        case 'cancelled':
            return <Badge variant="default" className="bg-blue-600 text-white">Cancelada</Badge>;
        default:
            return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
    }
};

export const formatDate = (dateStr: string) => {
    try {
        const date = parse(dateStr, 'yyyy-MM-dd', new Date());
        return format(date, 'dd MMM yyyy', { locale: es });
    } catch {
        return dateStr;
    }
};
