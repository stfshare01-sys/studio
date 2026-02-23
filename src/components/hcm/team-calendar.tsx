'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Plane,
    Stethoscope,
    Clock,
    Baby,
    Heart,
    User,
    AlertCircle
} from 'lucide-react';
import type { Employee, Incidence, IncidenceType } from '@/lib/types';
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    isSameDay,
    addMonths,
    subMonths,
    startOfWeek, // Used in calendarDays calculation
    endOfWeek    // Used in calendarDays calculation
} from 'date-fns';
import { es } from 'date-fns/locale';

interface TeamCalendarProps {
    employees: Employee[];
    incidences: Incidence[];
    onDayClick?: (date: Date, employeesOff: Employee[]) => void;
}

const INCIDENCE_CONFIG: Record<IncidenceType, { icon: typeof Plane; color: string; label: string }> = {
    vacation: { icon: Plane, color: 'bg-blue-500', label: 'Vacaciones' },
    sick_leave: { icon: Stethoscope, color: 'bg-red-500', label: 'Incapacidad' },
    personal_leave: { icon: Clock, color: 'bg-purple-500', label: 'Permiso' },
    maternity: { icon: Baby, color: 'bg-pink-500', label: 'Maternidad' },
    paternity: { icon: Baby, color: 'bg-cyan-500', label: 'Paternidad' },
    bereavement: { icon: Heart, color: 'bg-gray-500', label: 'Duelo' },
    unjustified_absence: { icon: AlertCircle, color: 'bg-orange-500', label: 'Falta' },
    abandono_empleo: { icon: AlertCircle, color: 'bg-red-700', label: 'Abandono' },
    marriage: { icon: Heart, color: 'bg-indigo-500', label: 'Matrimonio' },
    adoption: { icon: Baby, color: 'bg-emerald-500', label: 'Adopción' },
    unpaid_leave: { icon: User, color: 'bg-slate-500', label: 'Sin Goce' },
    civic_duty: { icon: Clock, color: 'bg-yellow-600', label: 'Deber Cívico' },
    half_day_family: { icon: Clock, color: 'bg-teal-500', label: 'Medio Día' }
};

/**
 * Get incidences for a specific date
 */
function getIncidencesForDate(date: Date, incidences: Incidence[]): Incidence[] {
    const dateStr = format(date, 'yyyy-MM-dd');
    return incidences.filter(inc => {
        if (inc.status !== 'approved') return false;
        const startStr = inc.startDate.substring(0, 10);
        const endStr = inc.endDate.substring(0, 10);
        return dateStr >= startStr && dateStr <= endStr;
    });
}

/**
 * Day cell in the calendar
 */
function DayCell({
    date,
    currentMonth,
    incidences,
    employees,
    onDayClick
}: {
    date: Date;
    currentMonth: Date;
    incidences: Incidence[];
    employees: Employee[];
    onDayClick?: (date: Date, employeesOff: Employee[]) => void;
}) {
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const isCurrentDay = isToday(date);
    const dayIncidences = getIncidencesForDate(date, incidences);

    // Group by employee
    const employeeIncidences = useMemo(() => {
        const map = new Map<string, Incidence[]>();
        dayIncidences.forEach(inc => {
            const existing = map.get(inc.employeeId) || [];
            map.set(inc.employeeId, [...existing, inc]);
        });
        return map;
    }, [dayIncidences]);

    const employeesOff = employees.filter(e => employeeIncidences.has(e.id));

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div
            className={`
        min-h-[80px] p-1 border-b border-r
        ${!isCurrentMonth ? 'bg-muted/30' : 'bg-background'}
        ${isCurrentDay ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''}
        hover:bg-muted/50 cursor-pointer transition-colors
      `}
            onClick={() => onDayClick?.(date, employeesOff)}
        >
            {/* Date Number */}
            <div className={`
        text-sm font-medium mb-1
        ${!isCurrentMonth ? 'text-muted-foreground' : ''}
        ${isCurrentDay ? 'text-primary' : ''}
      `}>
                {format(date, 'd')}
            </div>

            {/* Incidences */}
            {employeesOff.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                    <TooltipProvider>
                        {employeesOff.slice(0, 3).map(emp => {
                            const empIncidences = employeeIncidences.get(emp.id) || [];
                            const mainIncidence = empIncidences[0];
                            const config = mainIncidence ? INCIDENCE_CONFIG[mainIncidence.type] : null;

                            return (
                                <Tooltip key={emp.id}>
                                    <TooltipTrigger asChild>
                                        <div className="relative">
                                            <Avatar className="h-6 w-6 border border-background">
                                                <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />
                                                <AvatarFallback className="text-[10px]">{getInitials(emp.fullName)}</AvatarFallback>
                                            </Avatar>
                                            {config && (
                                                <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full ${config.color} flex items-center justify-center`}>
                                                    <config.icon className="h-2 w-2 text-white" />
                                                </div>
                                            )}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="font-medium">{emp.fullName}</p>
                                        {empIncidences.map(inc => (
                                            <p key={inc.id} className="text-xs text-muted-foreground">
                                                {INCIDENCE_CONFIG[inc.type]?.label || inc.type}
                                            </p>
                                        ))}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                        {employeesOff.length > 3 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                                        +{employeesOff.length - 3}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {employeesOff.slice(3).map(emp => (
                                        <p key={emp.id} className="text-sm">{emp.fullName}</p>
                                    ))}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </TooltipProvider>
                </div>
            )}
        </div>
    );
}

/**
 * Team Calendar Component
 */
export function TeamCalendar({ employees, incidences, onDayClick }: TeamCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Get calendar days
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

        return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }, [currentMonth]);

    // Get approved incidences only
    const approvedIncidences = useMemo(() =>
        incidences.filter(inc => inc.status === 'approved'),
        [incidences]
    );

    // Calculate stats for current month
    const monthStats = useMemo(() => {
        const monthStartStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const monthEndStr = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

        const monthIncidences = approvedIncidences.filter(inc => {
            const startStr = inc.startDate.substring(0, 10);
            const endStr = inc.endDate.substring(0, 10);
            return (startStr <= monthEndStr && endStr >= monthStartStr);
        });

        const vacationDays = monthIncidences
            .filter(inc => inc.type === 'vacation')
            .reduce((sum, inc) => sum + inc.totalDays, 0);

        const sickDays = monthIncidences
            .filter(inc => inc.type === 'sick_leave')
            .reduce((sum, inc) => sum + inc.totalDays, 0);

        const employeesOnLeave = new Set(monthIncidences.map(inc => inc.employeeId)).size;

        return { vacationDays, sickDays, employeesOnLeave };
    }, [currentMonth, approvedIncidences]);

    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">
                        {format(currentMonth, 'MMMM yyyy', { locale: es })}
                    </h3>
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setCurrentMonth(new Date())}
                        >
                            Hoy
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex gap-3 text-xs">
                    {Object.entries(INCIDENCE_CONFIG).slice(0, 4).map(([type, config]) => (
                        <div key={type} className="flex items-center gap-1">
                            <div className={`h-3 w-3 rounded-full ${config.color}`} />
                            <span>{config.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-blue-100">
                            <Plane className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-xl font-bold">{monthStats.vacationDays}</p>
                            <p className="text-xs text-muted-foreground">Días vacaciones</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-red-100">
                            <Stethoscope className="h-4 w-4 text-red-600" />
                        </div>
                        <div>
                            <p className="text-xl font-bold">{monthStats.sickDays}</p>
                            <p className="text-xs text-muted-foreground">Días incapacidad</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-purple-100">
                            <User className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-xl font-bold">{monthStats.employeesOnLeave}</p>
                            <p className="text-xs text-muted-foreground">Empleados con ausencia</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Calendar Grid */}
            <div className="border rounded-lg overflow-hidden">
                {/* Week Header */}
                <div className="grid grid-cols-7 bg-muted">
                    {weekDays.map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium border-b border-r last:border-r-0">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7">
                    {calendarDays.map(day => (
                        <DayCell
                            key={day.toISOString()}
                            date={day}
                            currentMonth={currentMonth}
                            incidences={approvedIncidences}
                            employees={employees}
                            onDayClick={onDayClick}
                        />
                    ))}
                </div>
            </div>

            {/* Upcoming absences */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Próximas Ausencias</CardTitle>
                    <CardDescription>Ausencias programadas para los próximos días</CardDescription>
                </CardHeader>
                <CardContent>
                    {approvedIncidences
                        .filter(inc => inc.startDate.substring(0, 10) >= format(new Date(), 'yyyy-MM-dd'))
                        .sort((a, b) => a.startDate.localeCompare(b.startDate))
                        .slice(0, 5)
                        .map(inc => {
                            const config = INCIDENCE_CONFIG[inc.type];
                            const Icon = config?.icon || User;
                            const employee = employees.find(e => e.id === inc.employeeId);

                            return (
                                <div key={inc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${config?.color || 'bg-gray-500'}`}>
                                            <Icon className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{employee?.fullName || inc.employeeName}</p>
                                            <p className="text-xs text-muted-foreground">{config?.label || inc.type}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm">{format(new Date(inc.startDate), 'dd MMM', { locale: es })}</p>
                                        <p className="text-xs text-muted-foreground">{inc.totalDays} día{inc.totalDays !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                            );
                        })}
                    {approvedIncidences.filter(inc => inc.startDate.substring(0, 10) >= format(new Date(), 'yyyy-MM-dd')).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No hay ausencias programadas
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default TeamCalendar;
