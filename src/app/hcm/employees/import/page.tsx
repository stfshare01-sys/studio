
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
    FileDown,
    RefreshCw,
    ArrowLeft
} from 'lucide-react';
import type { EmployeeImportBatch } from '@/lib/types';
import { callProcessEmployeeImport, type EmployeeImportRow } from '@/firebase/callable-functions';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ImportEmployeesPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState<{
        success: boolean;
        message: string;
        details?: string;
        errors?: { row: number; message: string; employeeId?: string }[];
    } | null>(null);

    // Fetch recent imports
    const importsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'employee_imports'),
            orderBy('uploadedAt', 'desc'),
            limit(10)
        );
    }, [firestore]);
    const { data: imports, isLoading: importsLoading } = useCollection<EmployeeImportBatch>(importsQuery);

    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        setUploadProgress(10);
        setUploadResult(null);

        try {
            const fileContent = await readFileAsText(file);
            setUploadProgress(30);

            const rows = parseCSV(fileContent);
            setUploadProgress(50);

            if (rows.length === 0) {
                throw new Error('El archivo está vacío o no tiene el formato correcto.');
            }

            const result = await callProcessEmployeeImport({
                rows,
                filename: file.name
            });
            setUploadProgress(100);

            setUploadResult({
                success: result.success,
                message: result.errorCount === 0
                    ? `Importación completada: ${result.successCount} empleados creados.`
                    : `Importación parcial: ${result.successCount} de ${result.recordCount} procesados.`,
                details: (result.errorCount ?? 0) > 0 ? `${result.errorCount ?? 0} filas con errores.` : undefined,
                errors: result.errors,
            });

        } catch (error) {
            console.error('Upload error:', error);
            setUploadResult({
                success: false,
                message: 'Error procesando el archivo',
                details: error instanceof Error ? error.message : 'Error desconocido'
            });
        } finally {
            setIsUploading(false);
            event.target.value = ''; // Reset file input
        }
    }, [user]);

    const readFileAsText = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    };

    const parseCSV = (content: string): EmployeeImportRow[] => {
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return [];

        const header = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const values = line.split(',');
            const row: any = {};
            header.forEach((key, index) => {
                row[key.trim()] = values[index]?.trim().replace(/"/g, '') || '';
            });
            return row as EmployeeImportRow;
        }).filter(row => row.email);
    };

    const downloadTemplate = () => {
        const templateHeader = "fullName,email,department,positionTitle,employmentType,shiftType,hireDate,salaryDaily,managerEmail";
        const templateExample = "Juan Perez,juan.perez@example.com,Ventas,Ejecutivo de Ventas,full_time,diurnal,2023-01-15,500.00,manager@example.com";
        const csvContent = `${templateHeader}\n${templateExample}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_empleados.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
            case 'partial': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            default: return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return <Badge className="bg-green-100 text-green-800">Completado</Badge>;
            case 'failed': return <Badge variant="destructive">Fallido</Badge>;
            case 'partial': return <Badge className="bg-yellow-100 text-yellow-800">Parcial</Badge>;
            case 'processing': return <Badge className="bg-blue-100 text-blue-800">Procesando</Badge>;
            default: return <Badge variant="secondary">{status}</Badge>;
        }
    };

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center gap-4 p-4 sm:p-6">
                    <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                        <Link href="/hcm/employees">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Importar Empleados</h1>
                        <p className="text-muted-foreground">
                            Carga masiva de nuevos empleados desde un archivo CSV.
                        </p>
                    </div>
                </header>
                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Cargar Archivo CSV</CardTitle>
                            <CardDescription>
                                Seleccione un archivo CSV para iniciar la carga masiva de empleados.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="border-2 border-dashed rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                    className="hidden"
                                    id="employee-upload"
                                />
                                <label htmlFor="employee-upload" className={`cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-4 bg-muted rounded-full">
                                            <Upload className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <p className="font-medium">{isUploading ? 'Procesando...' : 'Haz clic para seleccionar un archivo'}</p>
                                        <p className="text-sm text-muted-foreground">Solo archivos .csv</p>
                                    </div>
                                </label>
                            </div>

                            {isUploading && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm"><span>Procesando archivo...</span><span>{Math.round(uploadProgress)}%</span></div>
                                    <Progress value={uploadProgress} />
                                </div>
                            )}

                            {uploadResult && (
                                <Alert variant={uploadResult.success ? (uploadResult.errors && uploadResult.errors.length > 0 ? 'default' : 'default') : 'destructive'}
                                    className={uploadResult.success && uploadResult.errors && uploadResult.errors.length > 0 ? 'bg-yellow-50 border-yellow-200' : ''}>
                                    {uploadResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                    <AlertTitle>{uploadResult.success ? (uploadResult.errors && uploadResult.errors.length > 0 ? 'Importación Parcial' : 'Éxito') : 'Error'}</AlertTitle>
                                    <AlertDescription>
                                        {uploadResult.message}
                                        {uploadResult.details && <span className="block text-sm mt-1">{uploadResult.details}</span>}
                                        {uploadResult.errors && uploadResult.errors.length > 0 && (
                                            <div className="mt-2 p-2 bg-background rounded-md max-h-40 overflow-y-auto">
                                                <h4 className="font-semibold text-xs mb-1">Detalle de errores:</h4>
                                                <ul className="space-y-1 text-xs">
                                                    {uploadResult.errors.map((err, i) => (
                                                        <li key={i}>Fila {err.row}: {err.message}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="flex justify-end">
                                <Button variant="outline" onClick={downloadTemplate}>
                                    <FileDown className="mr-2 h-4 w-4" /> Descargar Plantilla
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Importaciones</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Archivo</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Registros</TableHead>
                                        <TableHead>Éxito / Errores</TableHead>
                                        <TableHead>Usuario</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {importsLoading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
                                    ) : (imports && imports.length > 0) ? (
                                        imports.map((imp) => (
                                            <TableRow key={imp.id}>
                                                <TableCell><div className="flex items-center gap-2">{getStatusIcon(imp.status)}{getStatusBadge(imp.status)}</div></TableCell>
                                                <TableCell><div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-muted-foreground" /><span className="truncate max-w-[200px]">{imp.filename}</span></div></TableCell>
                                                <TableCell>{format(new Date(imp.uploadedAt), 'dd MMM yyyy, HH:mm', { locale: es })}</TableCell>
                                                <TableCell>{imp.recordCount}</TableCell>
                                                <TableCell><span className="text-green-600">{imp.successCount}</span> / <span className="text-red-600">{imp.errorCount}</span></TableCell>
                                                <TableCell>{imp.uploadedByName}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay importaciones registradas.</TableCell></TableRow>
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
