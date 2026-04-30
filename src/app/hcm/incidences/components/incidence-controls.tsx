import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckCircle2, XCircle, Search, Filter, LayoutGrid, List } from 'lucide-react';

interface IncidenceControlsProps {
    viewMode: 'list' | 'calendar';
    setViewMode: (v: 'list' | 'calendar') => void;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    typeFilter: string;
    setTypeFilter: (v: string) => void;
    statusFilter: string;
    setStatusFilter: (v: string) => void;
    hasHRPermissions: boolean;
    isManagerOnly: boolean;
}

export function IncidenceControls({
    viewMode, setViewMode,
    pendingCount, approvedCount, rejectedCount,
    searchTerm, setSearchTerm,
    typeFilter, setTypeFilter,
    statusFilter, setStatusFilter,
    hasHRPermissions, isManagerOnly
}: IncidenceControlsProps) {
    return (
        <>
            <div className="flex items-center justify-between">
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')} className="w-[400px]">
                    <TabsList>
                        <TabsTrigger value="list" className="flex items-center gap-2">
                            <List className="h-4 w-4" /> Vista Lista
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="flex items-center gap-2">
                            <LayoutGrid className="h-4 w-4" /> Calendario
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-2 lg:grid-cols-3 bento-grid mt-4">
                <Card className="bento-item border-l-4 border-l-yellow-500">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card className="bento-item border-l-4 border-l-green-500">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                    </CardContent>
                </Card>
                <Card className="bento-item border-l-4 border-l-red-500">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                            disabled={!hasHRPermissions && !isManagerOnly}
                        />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-full md:w-[200px]">
                            <Filter className="mr-2 h-4 w-4" />
                            <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los tipos</SelectItem>
                            <SelectItem value="vacation">Vacaciones</SelectItem>
                            {hasHRPermissions && <SelectItem value="sick_leave">Incapacidad</SelectItem>}
                            <SelectItem value="maternity">Maternidad</SelectItem>
                            <SelectItem value="paternity">Paternidad</SelectItem>
                            <SelectItem value="bereavement">Duelo</SelectItem>
                            <SelectItem value="home_office">Home Office</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full md:w-[150px]">
                            <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="pending">Pendientes</SelectItem>
                            <SelectItem value="approved">Aprobadas</SelectItem>
                            <SelectItem value="rejected">Rechazadas</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </>
    );
}
