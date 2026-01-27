"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import {
  ArrowLeft,
  Calculator,
  DollarSign,
  Calendar,
  User,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { Employee, Compensation } from "@/lib/types";
import { callCalculateSettlement, type CalculateSettlementResponse } from "@/firebase/callable-functions";

type TerminationType = 'resignation' | 'dismissal_justified' | 'dismissal_unjustified' | 'mutual_agreement';

const TERMINATION_TYPES: Record<TerminationType, { label: string; description: string; color: string }> = {
  resignation: {
    label: 'Renuncia Voluntaria',
    description: 'El empleado decide terminar la relación laboral',
    color: 'bg-blue-500/10 text-blue-600',
  },
  dismissal_justified: {
    label: 'Despido Justificado',
    description: 'Terminación por causa justificada (Art. 47 LFT)',
    color: 'bg-orange-500/10 text-orange-600',
  },
  dismissal_unjustified: {
    label: 'Despido Injustificado',
    description: 'Terminación sin causa justificada (incluye indemnización)',
    color: 'bg-red-500/10 text-red-600',
  },
  mutual_agreement: {
    label: 'Mutuo Acuerdo',
    description: 'Terminación acordada entre ambas partes',
    color: 'bg-green-500/10 text-green-600',
  },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
}

function SettlementResultCard({ settlement }: { settlement: CalculateSettlementResponse['settlement'] }) {
  return (
    <Card className="border-green-500/50 bg-green-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <CardTitle>Cálculo de Liquidación</CardTitle>
          </div>
          <Badge variant="outline" className="bg-green-500/10 text-green-600">
            {settlement.status === 'draft' ? 'Borrador' : 'Calculado'}
          </Badge>
        </div>
        <CardDescription>
          {settlement.employeeName} - {new Date(settlement.terminationDate).toLocaleDateString('es-MX')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Percepciones */}
        <div>
          <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
            Percepciones
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Salario Pendiente</span>
              <span className="font-medium">{formatCurrency(settlement.salaryPending)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Vacaciones Proporcionales</span>
              <span className="font-medium">{formatCurrency(settlement.proportionalVacation)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Prima Vacacional Proporcional</span>
              <span className="font-medium">{formatCurrency(settlement.proportionalVacationPremium)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Aguinaldo Proporcional</span>
              <span className="font-medium">{formatCurrency(settlement.proportionalAguinaldo)}</span>
            </div>
            {settlement.severancePay > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Indemnización (3 meses)</span>
                <span className="font-medium">{formatCurrency(settlement.severancePay)}</span>
              </div>
            )}
            {settlement.twentyDaysPerYear > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">20 días por año</span>
                <span className="font-medium">{formatCurrency(settlement.twentyDaysPerYear)}</span>
              </div>
            )}
            {settlement.seniorityPremium > 0 && (
              <div className="flex justify-between">
                <span className="text-sm">Prima de Antigüedad</span>
                <span className="font-medium">{formatCurrency(settlement.seniorityPremium)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total Percepciones</span>
              <span className="text-green-600">{formatCurrency(settlement.totalPerceptions)}</span>
            </div>
          </div>
        </div>

        {/* Deducciones */}
        <div>
          <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
            Deducciones
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Total Deducciones</span>
              <span className="font-medium text-red-600">{formatCurrency(settlement.totalDeductions)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Total Neto */}
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Liquidación Neta</span>
          <span className="text-2xl text-green-600">{formatCurrency(settlement.netSettlement)}</span>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Calculado el {new Date(settlement.calculatedAt).toLocaleString('es-MX')}
      </CardFooter>
    </Card>
  );
}

export default function SettlementPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const employeeId = params.id as string;

  // State
  const [terminationType, setTerminationType] = useState<TerminationType | ''>('');
  const [terminationDate, setTerminationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [settlement, setSettlement] = useState<CalculateSettlementResponse['settlement'] | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Fetch employee data
  const employeeRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'employees', employeeId);
  }, [firestore, employeeId]);

  const { data: employee, isLoading: isEmployeeLoading } = useDoc<Employee>(employeeRef);

  // Fetch compensation data
  const compensationRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'compensation', employeeId);
  }, [firestore, employeeId]);

  const { data: compensation } = useDoc<Compensation>(compensationRef);

  const handleCalculate = async () => {
    if (!terminationType || !terminationDate) {
      toast({
        title: 'Campos incompletos',
        description: 'Por favor selecciona el tipo de terminación y la fecha.',
        variant: 'destructive',
      });
      return;
    }

    setIsCalculating(true);
    try {
      const result = await callCalculateSettlement({
        employeeId,
        terminationType,
        terminationDate,
      });

      if (result.success) {
        setSettlement(result.settlement);
        toast({
          title: 'Liquidación calculada',
          description: 'Los cálculos se han realizado correctamente según la LFT.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error al calcular',
        description: error.message || 'No se pudo calcular la liquidación',
        variant: 'destructive',
      });
    } finally {
      setIsCalculating(false);
    }
  };

  if (isEmployeeLoading) {
    return (
      <SiteLayout>
        <div className="flex flex-1 flex-col p-4 sm:p-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </SiteLayout>
    );
  }

  if (!employee) {
    return (
      <SiteLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold">Empleado no encontrado</h2>
            <p className="text-muted-foreground mt-2">
              El empleado solicitado no existe o no tienes acceso.
            </p>
            <Button asChild className="mt-4">
              <Link href="/hcm/employees">Volver a empleados</Link>
            </Button>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-4 p-4 sm:p-6 border-b">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/hcm/employees/${employeeId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calcular Liquidación</h1>
            <p className="text-muted-foreground">
              Finiquito o liquidación según la Ley Federal del Trabajo
            </p>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Employee Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Información del Empleado</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Nombre</Label>
                    <p className="font-medium">{employee.fullName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Departamento</Label>
                    <p className="font-medium">{employee.department}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Posición</Label>
                    <p className="font-medium">{employee.positionTitle}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Fecha de Ingreso</Label>
                    <p className="font-medium">
                      {employee.hireDate
                        ? new Date(employee.hireDate).toLocaleDateString('es-MX')
                        : 'No especificada'}
                    </p>
                  </div>
                </div>

                {compensation && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Salario Diario</Label>
                        <p className="font-medium">{formatCurrency(compensation.salaryDaily)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">SDI</Label>
                        <p className="font-medium">{formatCurrency(compensation.sdiBase)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Días Aguinaldo</Label>
                        <p className="font-medium">{compensation.aguinaldoDays} días</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Prima Vacacional</Label>
                        <p className="font-medium">{compensation.vacationPremium}%</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Settlement Calculator */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Calculadora de Liquidación</CardTitle>
                </div>
                <CardDescription>
                  Selecciona el tipo de terminación y la fecha para calcular la liquidación.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Termination Type */}
                <div className="space-y-2">
                  <Label htmlFor="terminationType">Tipo de Terminación</Label>
                  <Select
                    value={terminationType}
                    onValueChange={(v) => setTerminationType(v as TerminationType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo de terminación" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TERMINATION_TYPES).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span>{value.label}</span>
                            <span className="text-xs text-muted-foreground">{value.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {terminationType && (
                    <Badge variant="outline" className={TERMINATION_TYPES[terminationType].color}>
                      {TERMINATION_TYPES[terminationType].label}
                    </Badge>
                  )}
                </div>

                {/* Termination Date */}
                <div className="space-y-2">
                  <Label htmlFor="terminationDate">Fecha de Terminación</Label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="terminationDate"
                      type="date"
                      value={terminationDate}
                      onChange={(e) => setTerminationDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                {/* Warning for dismissal */}
                {terminationType === 'dismissal_unjustified' && (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-600">Aviso Importante</p>
                        <p className="text-muted-foreground mt-1">
                          El despido injustificado incluye indemnización constitucional
                          (3 meses de salario) y 20 días por año trabajado según la LFT.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!terminationType || !terminationDate || isCalculating}
                >
                  {isCalculating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculando...
                    </>
                  ) : (
                    <>
                      <DollarSign className="mr-2 h-4 w-4" />
                      Calcular Liquidación
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Settlement Result */}
          {settlement && (
            <SettlementResultCard settlement={settlement} />
          )}
        </main>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cálculo de liquidación</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a calcular la liquidación para <strong>{employee?.fullName}</strong> con tipo
              de terminación <strong>{terminationType && TERMINATION_TYPES[terminationType].label}</strong>.
              <br /><br />
              Este cálculo se guardará en el sistema. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowConfirmDialog(false);
              handleCalculate();
            }}>
              Calcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SiteLayout>
  );
}
