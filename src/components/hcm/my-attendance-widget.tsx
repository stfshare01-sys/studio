'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    LogIn, LogOut, Home, AlertTriangle, CheckCircle2,
    Loader2, Info, WifiOff, CalendarDays, MapPin, Navigation,
} from 'lucide-react';
import { useMyAttendance } from '@/hooks/use-my-attendance';
import type { Employee } from '@/lib/types';

// Días de la semana en español (0=Dom, 1=Lun...)
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface MyAttendanceWidgetProps {
    employee: Employee;
    compact?: boolean; // Si true, versión reducida para el dashboard
}

export function MyAttendanceWidget({ employee, compact = false }: MyAttendanceWidgetProps) {
    const {
        todayDate, isHODay, checkIn, checkOut, hoursWorked,
        isLoading, isSaving, error, successMessage,
        gpsStatus,
        missingPunchDetected, missingPunchType,
        showUnscheduledWarning,
        handleCheckIn, handleCheckOut,
        dismissUnscheduledWarning, confirmUnscheduledCheckIn,
    } = useMyAttendance({ employee });

    const now = new Date();
    const dayNum = now.getDay();
    const dayName = DAY_NAMES_FULL[dayNum];
    const workMode = employee.workMode ?? 'hybrid';

    // Config de badge por modalidad
    const modeBadge = {
        hybrid:  { label: 'Home Office',    icon: Home,       cls: 'bg-blue-600 text-white' },
        remote:  { label: 'Trabajo Remoto', icon: Home,       cls: 'bg-violet-600 text-white' },
        field:   { label: 'En Campo',       icon: Navigation, cls: 'bg-amber-600 text-white' },
        office:  { label: 'Oficina',        icon: Home,       cls: 'bg-slate-600 text-white' },
    }[workMode];

    // Descripción de sub-header según modalidad
    const modeDescription = workMode === 'hybrid'
        ? `Días HO configurados: ${(employee.homeOfficeDays ?? []).map(d => DAY_NAMES[d]).join(', ') || 'Ninguno'}`
        : workMode === 'remote'
        ? 'Modalidad 100% remota — widget activo todos los días'
        : 'Vendedor en campo — widget activo todos los días';

    const hasCheckIn = Boolean(checkIn);
    const hasCheckOut = Boolean(checkOut);
    const isComplete = hasCheckIn && hasCheckOut;

    return (
        <Card
            className={`w-full ${compact ? 'max-w-full' : 'max-w-md'} border-0 shadow-lg relative overflow-hidden`}
        >
            {/* Badge de modalidad */}
            <div className="absolute top-0 right-0 m-3">
                <Badge className={`gap-1 text-xs ${modeBadge.cls}`}>
                    <modeBadge.icon className="h-3 w-3" />
                    {modeBadge.label}
                </Badge>
            </div>

            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4 text-blue-500" />
                    {dayName} — {todayDate}
                </CardTitle>
                <CardDescription className="text-xs flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    {modeDescription}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Estado de carga */}
                {isLoading && (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando tu registro...</span>
                    </div>
                )}

                {/* Marcaje faltante detectado */}
                {!isLoading && missingPunchDetected && (
                    <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm">
                        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-medium text-orange-600 dark:text-orange-400">Marcaje faltante detectado</p>
                            <p className="text-xs text-muted-foreground">
                                No se registró tu{' '}
                                {missingPunchType === 'entry'
                                    ? 'entrada'
                                    : missingPunchType === 'exit'
                                        ? 'salida'
                                        : 'entrada y salida'}{' '}
                                de hoy. Se ha generado una incidencia para revisión de tu jefe.
                            </p>
                        </div>
                    </div>
                )}

                {/* Advertencia de HO no programado */}
                {showUnscheduledWarning && (
                    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                    Hoy no es tu día de Home Office
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Según tu configuración, {dayName} no está marcado como día de HO.
                                    Si confirmas, se notificará a tu jefe directo.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={dismissUnscheduledWarning}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                                onClick={confirmUnscheduledCheckIn}
                                disabled={isSaving}
                            >
                                {isSaving
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : 'Confirmar de todas formas'
                                }
                            </Button>
                        </div>
                    </div>
                )}

                {/* Panel de horarios */}
                {!isLoading && (
                    <div className="grid grid-cols-2 gap-3">
                        {/* Entrada */}
                        <div className={`rounded-lg p-3 border transition-colors ${hasCheckIn
                            ? 'border-green-500/30 bg-green-500/10'
                            : 'border-border bg-muted/30'
                            }`}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <LogIn className={`h-3.5 w-3.5 ${hasCheckIn ? 'text-green-500' : 'text-muted-foreground'}`} />
                                <span className="text-xs font-medium">Entrada</span>
                            </div>
                            <p className={`text-lg font-bold tabular-nums ${hasCheckIn
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-muted-foreground'
                                }`}>
                                {checkIn ?? '--:--'}
                            </p>
                        </div>

                        {/* Salida */}
                        <div className={`rounded-lg p-3 border transition-colors ${hasCheckOut
                            ? 'border-blue-500/30 bg-blue-500/10'
                            : 'border-border bg-muted/30'
                            }`}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <LogOut className={`h-3.5 w-3.5 ${hasCheckOut ? 'text-blue-500' : 'text-muted-foreground'}`} />
                                <span className="text-xs font-medium">Salida</span>
                            </div>
                            <p className={`text-lg font-bold tabular-nums ${hasCheckOut
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground'
                                }`}>
                                {checkOut ?? '--:--'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Horas trabajadas */}
                {isComplete && (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            {hoursWorked.toFixed(1)} horas trabajadas hoy
                        </span>
                    </div>
                )}

                {/* Mensajes de feedback */}
                {successMessage && (
                    <p className="text-xs text-center text-green-600 dark:text-green-400 font-medium">
                        {successMessage}
                    </p>
                )}
                {error && (
                    <p className="text-xs text-center text-red-500 font-medium">{error}</p>
                )}

                {/* Indicador GPS — solo para remote y field */}
                {(workMode === 'remote' || workMode === 'field') && !isLoading && !isComplete && (
                    <div className={`flex items-center gap-2 rounded-lg p-2 text-xs border ${
                        gpsStatus === 'granted'     ? 'bg-green-500/10 border-green-500/20 text-green-600' :
                        gpsStatus === 'denied'      ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                        gpsStatus === 'unavailable' ? 'bg-slate-500/10 border-slate-500/20 text-slate-500' :
                        gpsStatus === 'requesting'  ? 'bg-blue-500/10  border-blue-500/20  text-blue-500'  :
                        'bg-muted/30 border-border text-muted-foreground'
                    }`}>
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        {gpsStatus === 'granted'     && 'Ubicación disponible — se guardará al marcar'}
                        {gpsStatus === 'denied'      && 'Ubicación denegada — el marcaje procede sin coordenadas'}
                        {gpsStatus === 'unavailable' && 'GPS no disponible en este dispositivo'}
                        {gpsStatus === 'requesting'  && 'Obteniendo ubicación...'}
                        {gpsStatus === 'idle'        && 'GPS pendiente de permiso'}
                    </div>
                )}

                {/* Botones de acción */}
                {!isLoading && !showUnscheduledWarning && (
                    <div className="grid grid-cols-1 gap-2">
                        {!hasCheckIn && (
                            <Button
                                id="btn-self-check-in"
                                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold"
                                onClick={() => handleCheckIn()}
                                disabled={isSaving}
                            >
                                {isSaving
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <LogIn className="h-4 w-4" />
                                }
                                Registrar Entrada
                            </Button>
                        )}

                        {hasCheckIn && !hasCheckOut && (
                            <Button
                                id="btn-self-check-out"
                                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                onClick={handleCheckOut}
                                disabled={isSaving}
                            >
                                {isSaving
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <LogOut className="h-4 w-4" />
                                }
                                Registrar Salida
                            </Button>
                        )}

                        {isComplete && !compact && (
                            <div className="flex items-center justify-center gap-2 pt-1">
                                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">
                                    Marcaje completo — hasta mañana
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Pie: horario programado */}
                {employee.scheduledStart && employee.scheduledEnd && (
                    <p className="text-center text-xs text-muted-foreground">
                        Turno: {employee.scheduledStart} — {employee.scheduledEnd}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
