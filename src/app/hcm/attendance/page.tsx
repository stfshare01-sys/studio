
'use client';

import { useState, useCallback, useEffect } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Upload,
    FileSpreadsheet,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Download,
    RefreshCw,
    FileDown,
    ArrowLeft
} from 'lucide-react';
import { processAttendanceImport } from '@/firebase/actions/incidence-actions';
import type { OvertimeMode } from '@/firebase/actions/attendance-import-actions';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AttendanceImportBatch, AttendanceRecord } from "@/types/hcm.types";

/**
 * Attendance Import Page
 * Allows HR to upload Excel/CSV files with attendance data
 */
export default function AttendancePage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState<{
        success: boolean;
        message: string;
        details?: string;
        errors?: any[];
        batchId?: string;
    } | null>(null);
    const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

    // State to resolve string date formatting ambiguities
    const [dateFormatPreference, setDateFormatPreference] = useState<'dd/mm' | 'mm/dd'>('dd/mm');

    // Overtime mode: daily_limit (LFT 3h/día + 9h/semana) | weekly_only (solo 9h/semana)
    const [overtimeMode, setOvertimeMode] = useState<OvertimeMode>('weekly_only');
    const [isOvertimeModeConfirmed, setIsOvertimeModeConfirmed] = useState(false);

    // Fetch recent imports
    const importsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'attendance_imports'),
            orderBy('uploadedAt', 'desc'),
            limit(20)
        );
    }, [firestore]);

    const { data: imports, isLoading: importsLoading } = useCollection<AttendanceImportBatch>(importsQuery);

    // Fetch recent attendance records
    const attendanceQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'attendance'),
            orderBy('date', 'desc'),
            limit(50)
        );
    }, [firestore]);

    const { data: attendanceRecords, isLoading: attendanceLoading } = useCollection<AttendanceRecord>(attendanceQuery);

    // Fetch employee names for records that don't have employeeName (legacy data)
    useEffect(() => {
        if (!firestore || !attendanceRecords) return;

        const fetchEmployeeNames = async () => {
            const namesToFetch = attendanceRecords
                .filter(record => !record.employeeName && record.employeeId)
                .map(record => record.employeeId);

            const uniqueIds = [...new Set(namesToFetch)];
            const newNames: Record<string, string> = {};

            for (const empId of uniqueIds) {
                if (employeeNames[empId]) continue; // Skip if already fetched

                try {
                    const empRef = doc(firestore, 'employees', empId);
                    const empSnap = await getDoc(empRef);
                    if (empSnap.exists()) {
                        const empData = empSnap.data();
                        newNames[empId] = empData.fullName || empId;
                    }
                } catch (error) {
                    console.error(`Error fetching employee ${empId}:`, error);
                }
            }

            if (Object.keys(newNames).length > 0) {
                setEmployeeNames(prev => ({ ...prev, ...newNames }));
            }
        };

        fetchEmployeeNames();
    }, [firestore, attendanceRecords, employeeNames]);

    // Parse file using xlsx library
    const parseFile = async (file: File, formatPreference: 'dd/mm' | 'mm/dd'): Promise<Array<{
        employeeId: string;
        date: string;
        checkIn: string;
        checkOut: string;
    }>> => {
        const buffer = await file.arrayBuffer();

        // Dynamic import to avoid SSR issues if any, though standard import works in client components usually.
        // But for safety in Next.js client component:
        const { read, utils } = await import('xlsx');

        const workbook = read(buffer, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Parse to JSON with raw: true to get Date objects if cellFormats are dates
        const jsonData = utils.sheet_to_json(worksheet, { header: 1, raw: true }) as any[][];

        // Normalize dates to YYYY-MM-DD
        const normalizeDate = (val: any): string => {
            if (!val) return '';
            if (val instanceof Date) {
                // Fix timezone offset issues by using the UTC values since xlsx parses them as UTC midnights
                const year = val.getUTCFullYear();
                const month = String(val.getUTCMonth() + 1).padStart(2, '0');
                const day = String(val.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            if (typeof val === 'number') {
                // Excel date serial number
                const d = new Date(Math.round((val - 25569) * 86400 * 1000));
                const year = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day = String(d.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            if (typeof val === 'string') {
                const str = val.trim();
                if (str.includes('/')) {
                    const parts = str.split('/');
                    if (parts.length === 3) {
                        const p0 = parseInt(parts[0], 10);
                        const p1 = parseInt(parts[1], 10);
                        const p2 = parseInt(parts[2], 10);
                        // Depending on formatPreference, we choose how to handle early DD and MM
                        if (formatPreference === 'dd/mm') {
                            // En DD/MM/YYYY: p0 es Dia, p1 es Mes, p2 es Año
                            if (p2 > 1000 && p1 <= 12 && p0 <= 31) {
                                return `${p2}-${p1.toString().padStart(2, '0')}-${p0.toString().padStart(2, '0')}`;
                            }
                        } else { // formatPreference === 'mm/dd'
                            // En MM/DD/YYYY: p0 es Mes, p1 es Dia, p2 es Año
                            if (p2 > 1000 && p0 <= 12 && p1 <= 31) {
                                return `${p2}-${p0.toString().padStart(2, '0')}-${p1.toString().padStart(2, '0')}`;
                            }
                        }

                        // Fallback genérico si el estricto falla (ejemplo: usuario dijo dd/mm pero subió mes en 13+)
                        if (p2 > 1000 && p0 <= 12 && p1 <= 31) {
                            return `${p2}-${p0.toString().padStart(2, '0')}-${p1.toString().padStart(2, '0')}`;
                        }
                        if (p2 > 1000 && p1 <= 12 && p0 <= 31) {
                            return `${p2}-${p1.toString().padStart(2, '0')}-${p0.toString().padStart(2, '0')}`;
                        }

                        // YYYY/MM/DD
                        if (p0 > 1000 && p1 <= 12 && p2 <= 31) {
                            return `${p0}-${p1.toString().padStart(2, '0')}-${p2.toString().padStart(2, '0')}`;
                        }
                    }
                }
                // Try mapping YYYY-MM-DD
                if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
                    return str.substring(0, 10);
                }
            }
            return String(val);
        };

        const normalizeTime = (val: any): string => {
            if (!val) return '';
            if (val instanceof Date) {
                return format(val, 'HH:mm:ss');
            }
            if (typeof val === 'number') {
                // Excel time fraction
                const totalSeconds = Math.round(val * 86400);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            if (typeof val === 'string') {
                const s = val.trim();
                const isPM = s.toLowerCase().includes('p');
                const isAM = s.toLowerCase().includes('a');

                const timeParts = s.replace(/[^0-9:]/g, '').split(':');
                if (timeParts.length >= 2) {
                    let h = parseInt(timeParts[0], 10);
                    const m = parseInt(timeParts[1], 10);
                    const sec = timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0;

                    if (isPM && h < 12) h += 12;
                    if (isAM && h === 12) h = 0;

                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                }
                return s;
            }
            return String(val);
        };

        // Skip header row (index 0) and map columns
        // Assuming format: EmployeeID | Date | CheckIn | CheckOut
        return jsonData.slice(1).map(row => {
            return {
                employeeId: row[0] ? String(row[0]).trim() : '',
                date: normalizeDate(row[1]),
                checkIn: normalizeTime(row[2]),
                checkOut: normalizeTime(row[3])
            };
        }).filter(row => row.employeeId && row.date);
    };

    // Handle file upload
    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user || !isOvertimeModeConfirmed) return;

        setIsUploading(true);
        setUploadProgress(10);
        setUploadResult(null);

        try {
            setUploadProgress(30);

            // Parse CSV/Excel using xlsx, pass in the format preference
            const rows = await parseFile(file, dateFormatPreference);
            setUploadProgress(50);

            if (rows.length === 0) {
                throw new Error('El archivo está vacío o no tiene el formato correcto');
            }

            // Process the import
            const result = await processAttendanceImport(
                rows,
                user.uid,
                user.fullName || user.email || 'Unknown',
                file.name,
                { overtimeMode }
            );

            setUploadProgress(100);

            if (result.success) {
                const skippedMsg = result.skippedCount && result.skippedCount > 0
                    ? `, ${result.skippedCount} omitidos (duplicados)`
                    : '';

                setUploadResult({
                    success: true,
                    message: `Importación completada: ${result.successCount} procesados${skippedMsg}`,
                    details: result.errorCount && result.errorCount > 0
                        ? `${result.errorCount} registros con errores`
                        : undefined,
                    batchId: result.batchId,
                    errors: result.errors
                });
            } else {
                setUploadResult({
                    success: false,
                    message: 'Error en la importación',
                    details: result.errors?.[0]?.message,
                    errors: result.errors
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
            setUploadResult({
                success: false,
                message: 'Error procesando el archivo',
                details: error instanceof Error ? error.message : 'Error desconocido'
            });
        } finally {
            setIsUploading(false);
            // Reset file input
            event.target.value = '';
        }
    }, [user, dateFormatPreference, overtimeMode, isOvertimeModeConfirmed]);

    // Download template
    const downloadTemplate = () => {
        const template = 'employeeId,date,checkIn,checkOut\nEMP001,15/01/2026,08:00:00,17:00:00\nEMP002,15/01/2026,09:00:00,18:00:00';
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_asistencia.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatDate = (dateValue: any) => {
        try {
            if (!dateValue) return '-';
            let dateObj;
            if (typeof dateValue?.toDate === 'function') {
                dateObj = dateValue.toDate();
            } else if (typeof dateValue === 'object') {
                return 'Procesando...'; // FieldValue
            } else {
                dateObj = new Date(dateValue);
            }
            return format(dateObj, 'dd MMM yyyy, HH:mm', { locale: es });
        } catch {
            return String(dateValue);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'partial':
                return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            default:
                return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-100 text-green-800">Completado</Badge>;
            case 'failed':
                return <Badge variant="destructive">Fallido</Badge>;
            case 'partial':
                return <Badge className="bg-yellow-100 text-yellow-800">Parcial</Badge>;
            case 'processing':
                return <Badge className="bg-blue-100 text-blue-800">Procesando</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center gap-4 p-4 sm:p-6">
                    <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                        <Link href="/hcm">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Importación de Asistencia</h1>
                        <p className="text-muted-foreground">
                            Carga masiva de registros de asistencia desde archivos Excel/CSV
                        </p>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Cargar Archivo de Asistencia</CardTitle>
                            <CardDescription>
                                Sube un archivo CSV o Excel con los registros de entrada y salida
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Overtime Mode Selector */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-muted/40 rounded-lg border">
                                <div className="flex items-center gap-4 flex-1 w-full">
                                    <Label htmlFor="overtime-mode" className="text-sm font-medium whitespace-nowrap">
                                        Modo Horas Dobles:
                                    </Label>
                                    <Select
                                        value={overtimeMode}
                                        onValueChange={(val) => {
                                            setOvertimeMode(val as OvertimeMode);
                                            setIsOvertimeModeConfirmed(false); // require re-confirmation
                                        }}
                                        disabled={isOvertimeModeConfirmed}
                                    >
                                        <SelectTrigger id="overtime-mode" className="w-full sm:w-[320px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="daily_limit">
                                                H2 con Límite por Día (3h/día + 9h/sem)
                                            </SelectItem>
                                            <SelectItem value="weekly_only">
                                                H2 sin Límite por Día (solo 9h/sem)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center w-full sm:w-auto mt-2 sm:mt-0">
                                    {isOvertimeModeConfirmed ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsOvertimeModeConfirmed(false)}
                                            className="w-full sm:w-auto"
                                        >
                                            <RefreshCw className="h-4 w-4 mr-2" /> Cambiar Selección
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={() => setIsOvertimeModeConfirmed(true)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                        >
                                            <CheckCircle2 className="h-4 w-4 mr-2" /> Aceptar Modo
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Upload Area */}
                            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${!isOvertimeModeConfirmed ? 'opacity-50 bg-muted/20 grayscale' : 'hover:border-blue-500 hover:bg-blue-50/50'}`}>
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileUpload}
                                    disabled={!isOvertimeModeConfirmed || isUploading}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <Button
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                    disabled={!isOvertimeModeConfirmed || isUploading}
                                    className={`cursor-pointer w-full py-8 ${isUploading ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-4 bg-muted rounded-full">
                                            <Upload className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-medium">
                                                {!isOvertimeModeConfirmed 
                                                    ? 'Confirma el Modo de Horas Dobles arriba primero' 
                                                    : isUploading 
                                                        ? 'Procesando...' 
                                                        : 'Haz clic para seleccionar y procesar un archivo'
                                                }
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                CSV o Excel (máx. 10MB)
                                            </p>
                                        </div>
                                    </div>
                                </Button>
                            </div>

                            {/* Progress Bar */}
                            {isUploading && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Procesando archivo...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <Progress value={uploadProgress} />
                                </div>
                            )}

                            {/* Result Alert */}
                            {uploadResult && (
                                <Alert variant={uploadResult.success ? 'default' : 'destructive'}>
                                    {uploadResult.success ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        <XCircle className="h-4 w-4" />
                                    )}
                                    <AlertTitle>{uploadResult.success ? 'Éxito' : 'Error'}</AlertTitle>
                                    <AlertDescription>
                                        {uploadResult.message}
                                        {uploadResult.details && (
                                            <span className="block text-sm mt-1">{uploadResult.details}</span>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="flex justify-end">
                                <Button variant="default" className="button-aura" onClick={downloadTemplate}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Descargar Plantilla
                                </Button>
                            </div>

                            {/* Format Instructions */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <h4 className="font-medium mb-2">Formato esperado del archivo:</h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <p>• <strong>Columna A:</strong> ID del empleado (debe existir en el sistema)</p>
                                    <p>• <strong>Columna B:</strong> Fecha (formato DD/MM/YYYY o YYYY-MM-DD)</p>
                                    <p>• <strong>Columna C:</strong> Hora de entrada (formato HH:mm:ss)</p>
                                    <p>• <strong>Columna D:</strong> Hora de salida (formato HH:mm:ss)</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Imports */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Importaciones</CardTitle>
                            <CardDescription>
                                Últimos archivos procesados
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Archivo</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Registros</TableHead>
                                        <TableHead>Éxito</TableHead>
                                        <TableHead>Omitidos</TableHead>
                                        <TableHead>Errores</TableHead>
                                        <TableHead>Usuario</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {importsLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8">
                                                Cargando historial...
                                            </TableCell>
                                        </TableRow>
                                    ) : imports && imports.length > 0 ? (
                                        imports.map((imp) => (
                                            <TableRow key={imp.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {getStatusIcon(imp.status)}
                                                        {getStatusBadge(imp.status)}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                                        <span className="truncate max-w-[200px]">{imp.filename}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{formatDate(imp.uploadedAt)}</TableCell>
                                                <TableCell>{imp.recordCount}</TableCell>
                                                <TableCell>
                                                    <span className="text-green-600">{imp.successCount}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-yellow-600">{imp.skippedCount || 0}</span>
                                                </TableCell>
                                                <TableCell>
                                                    {imp.errorCount > 0 ? (
                                                        <span className="text-red-600">{imp.errorCount}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">0</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{imp.uploadedByName || imp.uploadedById}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                No hay importaciones registradas
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Recent Attendance Records */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Registros de Asistencia Recientes</CardTitle>
                            <CardDescription>
                                Últimos registros importados al sistema
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Entrada</TableHead>
                                        <TableHead>Salida</TableHead>
                                        <TableHead>Horas</TableHead>
                                        <TableHead>Horas Extra</TableHead>
                                        <TableHead>Validación</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {attendanceLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
                                                Cargando registros...
                                            </TableCell>
                                        </TableRow>
                                    ) : attendanceRecords && attendanceRecords.length > 0 ? (
                                        attendanceRecords.slice(0, 10).map((record) => (
                                            <TableRow
                                                key={record.id}
                                                className={!record.isValid ? "bg-red-50/50 hover:bg-red-50/80 dark:bg-red-950/20" : record.overtimeHours > 0 ? "bg-orange-50/50 hover:bg-orange-50/80 dark:bg-orange-950/20" : ""}
                                            >
                                                <TableCell className="font-medium">{record.employeeName || employeeNames[record.employeeId] || record.employeeId}</TableCell>
                                                <TableCell className="tabular-nums whitespace-nowrap">{record.date}</TableCell>
                                                <TableCell className="font-mono tabular-nums text-right">{record.checkIn || '-'}</TableCell>
                                                <TableCell className="font-mono tabular-nums text-right">{record.checkOut || '-'}</TableCell>
                                                <TableCell className="font-mono tabular-nums text-right font-medium">{record.hoursWorked?.toFixed(2) || '-'}</TableCell>
                                                <TableCell className="text-right">
                                                    {record.overtimeHours > 0 ? (
                                                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800">
                                                            +{record.overtimeHours.toFixed(2)}h
                                                            {record.overtimeType && ` (${record.overtimeType === 'double' ? '2x' : '3x'})`}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {record.isValid ? (
                                                        <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            <span className="text-xs font-medium">Válido</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-red-600 dark:text-red-500">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            <span className="text-xs font-medium truncate max-w-[150px]" title={record.validationNotes || undefined}>
                                                                {record.validationNotes}
                                                            </span>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                No hay registros de asistencia
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
