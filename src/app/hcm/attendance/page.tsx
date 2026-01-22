
'use client';

import { useState, useCallback } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import type { AttendanceImportBatch, AttendanceRecord } from '@/lib/types';
import { processAttendanceImport } from '@/firebase/hcm-actions';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
    } | null>(null);

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

    // Handle file upload
    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        setUploadProgress(10);
        setUploadResult(null);

        try {
            // Read file content
            const fileContent = await readFileAsText(file);
            setUploadProgress(30);

            // Parse CSV/Excel (simplified - in production use a proper library like xlsx)
            const rows = parseCSV(fileContent);
            setUploadProgress(50);

            if (rows.length === 0) {
                throw new Error('El archivo está vacío o no tiene el formato correcto');
            }

            // Process the import
            const result = await processAttendanceImport(
                rows,
                user.uid,
                user.fullName || user.email || 'Unknown',
                file.name
            );

            setUploadProgress(100);

            if (result.success) {
                setUploadResult({
                    success: true,
                    message: `Importación completada: ${result.successCount} de ${result.recordCount} registros procesados`,
                    details: result.errorCount && result.errorCount > 0
                        ? `${result.errorCount} registros con errores`
                        : undefined
                });
            } else {
                setUploadResult({
                    success: false,
                    message: 'Error en la importación',
                    details: result.errors?.[0]?.message
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
    }, [user]);

    // Helper to read file as text
    const readFileAsText = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    };

    // Simple CSV parser (in production, use a proper library)
    const parseCSV = (content: string): Array<{
        employeeId: string;
        date: string;
        checkIn: string;
        checkOut: string;
    }> => {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        // Skip header row
        return lines.slice(1).map(line => {
            const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
            return {
                employeeId: cols[0] || '',
                date: cols[1] || '',
                checkIn: cols[2] || '',
                checkOut: cols[3] || ''
            };
        }).filter(row => row.employeeId && row.date);
    };

    // Download template
    const downloadTemplate = () => {
        const template = 'employeeId,date,checkIn,checkOut\nEMP001,2024-01-15,08:00:00,17:00:00\nEMP002,2024-01-15,09:00:00,18:00:00';
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_asistencia.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: es });
        } catch {
            return dateStr;
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
                    <Button variant="outline" size="icon" asChild>
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
                            {/* Upload Area */}
                            <div className="border-2 border-dashed rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <label
                                    htmlFor="file-upload"
                                    className={`cursor-pointer ${isUploading ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-4 bg-muted rounded-full">
                                            <Upload className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-medium">
                                                {isUploading ? 'Procesando...' : 'Haz clic para seleccionar un archivo'}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                CSV o Excel (máx. 10MB)
                                            </p>
                                        </div>
                                    </div>
                                </label>
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
                                <Button variant="outline" onClick={downloadTemplate}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Descargar Plantilla
                                </Button>
                             </div>

                            {/* Format Instructions */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <h4 className="font-medium mb-2">Formato esperado del archivo:</h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <p>• <strong>Columna A:</strong> ID del empleado (debe existir en el sistema)</p>
                                    <p>• <strong>Columna B:</strong> Fecha (formato YYYY-MM-DD)</p>
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
                                        <TableHead>Errores</TableHead>
                                        <TableHead>Usuario</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {importsLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
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
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                                            <TableRow key={record.id}>
                                                <TableCell>{record.employeeId}</TableCell>
                                                <TableCell>{record.date}</TableCell>
                                                <TableCell>{record.checkIn || '-'}</TableCell>
                                                <TableCell>{record.checkOut || '-'}</TableCell>
                                                <TableCell>{record.hoursWorked?.toFixed(2) || '-'}</TableCell>
                                                <TableCell>
                                                    {record.overtimeHours > 0 ? (
                                                        <Badge variant="outline" className="bg-orange-50">
                                                            +{record.overtimeHours.toFixed(2)}h
                                                            {record.overtimeType && ` (${record.overtimeType === 'double' ? '2x' : '3x'})`}
                                                        </Badge>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {record.isValid ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
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
