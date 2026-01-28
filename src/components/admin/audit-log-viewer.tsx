'use client';

import { useState, useMemo } from 'react';
import { useFirestore } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ShieldAlert, Search, FileText, User } from 'lucide-react';
import type { AuditLog } from '@/lib/types';

export default function AuditLogViewer() {
    const [limitCount, setLimitCount] = useState(50);
    const [searchTerm, setSearchTerm] = useState('');

    const firestore = useFirestore();

    const logsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'audit_logs'),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
    }, [firestore, limitCount]);

    const { data: logs, isLoading } = useCollection<AuditLog>(logsQuery);

    // Client-side filtering for basic search (until sophisticated backend search is implemented)
    const filteredLogs = logs?.filter(log =>
        log.userFullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.requestId?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const getActionBadge = (action: string) => {
        if (action.includes('DELETE')) return <Badge variant="destructive">{action}</Badge>;
        if (action.includes('UPDATE') || action.includes('EDIT')) return <Badge className="bg-yellow-100 text-yellow-800">{action}</Badge>;
        if (action.includes('CREATE') || action.includes('SUBMIT')) return <Badge className="bg-green-100 text-green-800">{action}</Badge>;
        return <Badge variant="outline">{action}</Badge>;
    };

    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'dd MMM yyyy HH:mm:ss', { locale: es });
        } catch {
            return dateStr;
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-blue-600" />
                            Registro de Auditoría (Audit Log)
                        </CardTitle>
                        <CardDescription>
                            Monitor de acciones críticas del sistema. Prerrequisito para Admin God-Mode.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar usuario o acción..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <Select value={limitCount.toString()} onValueChange={(v) => setLimitCount(Number(v))}>
                            <SelectTrigger className="w-[100px]">
                                <SelectValue placeholder="Ver" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="20">20 items</SelectItem>
                                <SelectItem value="50">50 items</SelectItem>
                                <SelectItem value="100">100 items</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha / Hora</TableHead>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Acción</TableHead>
                                <TableHead>Contexto (ID)</TableHead>
                                <TableHead>Detalles</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        Cargando registros de seguridad...
                                    </TableCell>
                                </TableRow>
                            ) : filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No se encontraron eventos recientes.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredLogs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-mono text-xs">
                                            {formatDate(log.timestamp)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <User className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-medium">{log.userFullName}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{log.userId}</span>
                                        </TableCell>
                                        <TableCell>
                                            {getActionBadge(log.action)}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {log.requestId || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="max-w-[300px] truncate text-xs text-muted-foreground" title={JSON.stringify(log.details, null, 2)}>
                                                {JSON.stringify(log.details)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
