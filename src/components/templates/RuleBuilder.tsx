"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import {
    GitBranch, ShieldCheck, Hash, CaseSensitive,
    User, Bell, AlertTriangle, ChevronsRight, Pencil, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType } from '@/types/auth.types';
import type { Rule, RuleCondition, RuleAction, FormField, WorkflowStepDefinition, RuleOperator, FormFieldType } from "@/types/workflow.types";

type Lane = { id: string; name: string; steps: WorkflowStepDefinition[] };
type Pool = { id: string; name: string; lanes: Lane[] };

// ─── RuleConditionDisplay ────────────────────────────────────────────────────

interface RuleConditionDisplayProps {
    condition: RuleCondition;
    fields: FormField[];
    steps: WorkflowStepDefinition[];
}

export function RuleConditionDisplay({ condition, fields, steps }: RuleConditionDisplayProps) {
    const source = condition.type === 'form'
        ? fields.find(f => f.id === condition.fieldId)
        : steps.find(s => s.id === condition.fieldId);

    const operatorLabels: Partial<Record<RuleOperator, string>> = {
        '==': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
        'contains': 'contiene', 'not_contains': 'no contiene', 'is': 'es', 'is_not': 'no es',
    };

    const getSourceTypeIcon = (type: FormFieldType | 'outcome' | undefined) => {
        switch (type) {
            case 'number': return <Hash className="h-4 w-4 text-muted-foreground" />;
            case 'text':
            case 'textarea': return <CaseSensitive className="h-4 w-4 text-muted-foreground" />;
            case 'select':
            case 'radio':
            case 'checkbox':
            case 'outcome': return <GitBranch className="h-4 w-4 text-muted-foreground" />;
            default: return null;
        }
    };

    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-muted-foreground">SI</span>
            <div className="flex items-center gap-1">
                {getSourceTypeIcon((source?.type || (condition.type === 'outcome' ? 'outcome' : undefined)) as FormFieldType | 'outcome' | undefined)}
                <Badge variant="outline">{(source as any)?.name || (source as any)?.label || '??'}</Badge>
            </div>
            <span className="font-semibold text-muted-foreground">{operatorLabels[condition.operator] || condition.operator}</span>
            <Badge variant="secondary" className="font-mono">{condition.value}</Badge>
        </div>
    );
}

// ─── RuleActionDisplay ───────────────────────────────────────────────────────

interface RuleActionDisplayProps {
    action: RuleAction;
    steps: WorkflowStepDefinition[];
    users: UserType[];
}

export function RuleActionDisplay({ action, steps, users }: RuleActionDisplayProps) {
    const getActionIcon = (type: RuleAction['type']) => {
        switch (type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP': return <GitBranch className="h-5 w-5 text-primary" />;
            case 'ASSIGN_USER': return <User className="h-5 w-5 text-primary" />;
            case 'SEND_NOTIFICATION': return <Bell className="h-5 w-5 text-primary" />;
            case 'CHANGE_REQUEST_PRIORITY': return <AlertTriangle className="h-5 w-5 text-primary" />;
        }
    };

    const renderActionDetails = () => {
        switch (action.type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP': {
                const step = steps.find(s => s.id === action.stepId);
                return <>{action.type === 'ROUTE_TO_STEP' ? 'Enrutar a' : 'Añadir paso'}: <Badge>{step?.name || '??'}</Badge></>;
            }
            case 'ASSIGN_USER': {
                const assignUser = users.find(u => u.id === action.userId);
                const assignStep = steps.find(s => s.id === action.stepId);
                return <>Asignar <Badge variant="secondary">{assignUser?.fullName || '??'}</Badge> a <Badge>{assignStep?.name || '??'}</Badge></>;
            }
            case 'SEND_NOTIFICATION':
                return <>Notificar a <Badge variant="secondary">{action.target}</Badge> con mensaje: <span className="italic">"{action.message}"</span></>;
            case 'CHANGE_REQUEST_PRIORITY':
                return <>Cambiar prioridad a <Badge variant="destructive">{action.priority}</Badge></>;
            default:
                return null;
        }
    };

    return (
        <div className="flex items-center gap-3">
            <div className="flex-shrink-0">{getActionIcon(action.type)}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">{renderActionDetails()}</div>
        </div>
    );
}

// ─── RuleDisplay ─────────────────────────────────────────────────────────────

interface RuleDisplayProps {
    rule: Rule;
    fields: FormField[];
    pools: Pool[];
    users: UserType[];
    onRemove: (id: string) => void;
    onEdit: (rule: Rule) => void;
}

export function RuleDisplay({ rule, fields, pools, users, onRemove, onEdit }: RuleDisplayProps) {
    const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));

    return (
        <div className="group relative rounded-lg border bg-card p-4 transition-all hover:shadow-md">
            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-4">
                <RuleConditionDisplay condition={rule.condition} fields={fields} steps={allSteps} />
                <div className="flex justify-center">
                    <ChevronsRight className="h-6 w-6 text-muted-foreground" />
                </div>
                <RuleActionDisplay action={rule.action} steps={allSteps} users={users} />
            </div>
            <Button variant="ghost" size="icon" className="absolute right-8 top-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(rule)}>
                <Pencil className="h-4 w-4 text-primary" />
                <span className="sr-only">Editar regla</span>
            </Button>
            <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onRemove(rule.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="sr-only">Eliminar regla</span>
            </Button>
        </div>
    );
}

// ─── RuleBuilderDialog ───────────────────────────────────────────────────────

interface RuleBuilderDialogProps {
    fields: FormField[];
    steps: WorkflowStepDefinition[];
    users: UserType[];
    onAddRule: (rule: Omit<Rule, 'id'>) => void;
    onUpdateRule: (rule: Rule) => void;
    ruleToEdit: Rule | null;
    onClose: () => void;
}

export function RuleBuilderDialog({ fields, steps, users, onAddRule, onUpdateRule, ruleToEdit, onClose }: RuleBuilderDialogProps) {
    const { toast } = useToast();
    const [condition, setCondition] = useState<Partial<RuleCondition>>({ type: 'form' });
    const [action, setAction] = useState<Partial<RuleAction>>({ type: 'REQUIRE_ADDITIONAL_STEP' });
    const isEditing = !!ruleToEdit;

    useEffect(() => {
        if (ruleToEdit) {
            setCondition(ruleToEdit.condition);
            setAction(ruleToEdit.action);
        } else {
            setCondition({ type: 'form' });
            setAction({ type: 'REQUIRE_ADDITIONAL_STEP' });
        }
    }, [ruleToEdit]);

    const decisionTasks = steps.filter(s => s.outcomes && s.outcomes.length > 0);
    const formFieldsForRules = fields.filter(f => ['number', 'select', 'radio', 'text', 'textarea'].includes(f.type));
    const selectedSource = condition.type === 'form'
        ? formFieldsForRules.find(f => f.id === condition.fieldId)
        : decisionTasks.find(s => s.id === condition.fieldId);

    const getOperatorsForType = (type?: FormFieldType | 'outcome'): { value: RuleOperator; label: string }[] => {
        if (type === 'outcome') return [{ value: '==', label: 'es igual a' }];
        switch (type) {
            case 'number':
                return [
                    { value: '==', label: 'es igual a' }, { value: '!=', label: 'no es igual a' },
                    { value: '>', label: 'es mayor que' }, { value: '<', label: 'es menor que' },
                    { value: '>=', label: 'es mayor o igual que' }, { value: '<=', label: 'es menor o igual que' },
                ];
            case 'text':
            case 'textarea':
                return [{ value: 'is', label: 'es igual a' }, { value: 'is_not', label: 'no es igual a' }, { value: 'contains', label: 'contiene' }, { value: 'not_contains', label: 'no contiene' }];
            case 'select':
            case 'radio':
                return [{ value: 'is', label: 'es' }, { value: 'is_not', label: 'no es' }];
            default: return [];
        }
    };

    const availableOperators = getOperatorsForType((selectedSource?.type || (condition.type === 'outcome' ? 'outcome' : undefined)) as FormFieldType | 'outcome' | undefined);

    const handleSubmit = () => {
        if (!condition.fieldId || !condition.operator || condition.value === undefined || condition.value === '') {
            toast({ variant: "destructive", title: "Condición incompleta" });
            return;
        }
        const newRule: Omit<Rule, 'id'> = { condition: condition as RuleCondition, action: action as RuleAction };
        if (isEditing && ruleToEdit) {
            onUpdateRule({ ...newRule, id: ruleToEdit.id });
        } else {
            onAddRule(newRule);
        }
        toast({ title: isEditing ? "Regla actualizada" : "Regla agregada" });
        onClose();
    };

    return (
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>{isEditing ? "Editar Regla de Negocio" : "Constructor de Reglas de Negocio"}</DialogTitle>
                <DialogDescription>Cree una regla "SI-ENTONCES" para automatizar su flujo de trabajo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary" /> Condición (SI)</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2 col-span-1">
                            <Label>Tipo de Condición</Label>
                            <Select value={condition.type} onValueChange={(v) => setCondition({ type: v as any })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="form">Basada en Campo de Formulario</SelectItem>
                                    <SelectItem value="outcome">Basada en Resultado de Tarea</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 col-span-3 grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Fuente</Label>
                                <Select value={condition.fieldId} onValueChange={(v) => setCondition(c => ({ ...c, fieldId: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione fuente..." /></SelectTrigger>
                                    <SelectContent>
                                        {condition.type === 'form' && formFieldsForRules.map(field => <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>)}
                                        {condition.type === 'outcome' && decisionTasks.map(task => <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Operador</Label>
                                <Select value={condition.operator} onValueChange={(v) => setCondition(c => ({ ...c, operator: v as any }))} disabled={!selectedSource}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                    <SelectContent>{availableOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor</Label>
                                {selectedSource && ['number', 'text', 'textarea'].includes(selectedSource.type) ? (
                                    <Input type={selectedSource.type === 'number' ? 'number' : 'text'} placeholder="p.ej., 5000" value={condition.value || ''} onChange={(e) => setCondition(c => ({ ...c, value: e.target.value }))} />
                                ) : (
                                    <Select value={condition.value} onValueChange={(v) => setCondition(c => ({ ...c, value: v }))} disabled={!selectedSource}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione valor..." /></SelectTrigger>
                                        <SelectContent>
                                            {((selectedSource as any)?.options || (selectedSource as any)?.outcomes)?.map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><GitBranch className="mr-2 h-5 w-5 text-primary" /> Acción (ENTONCES)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo de Acción</Label>
                            <Select value={action.type} onValueChange={(v) => setAction({ type: v as any })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="REQUIRE_ADDITIONAL_STEP">Añadir Paso Requerido</SelectItem>
                                    <SelectItem value="ROUTE_TO_STEP">Enrutar a Paso</SelectItem>
                                    <SelectItem value="ASSIGN_USER">Asignar Usuario a Tarea</SelectItem>
                                    <SelectItem value="SEND_NOTIFICATION">Enviar Notificación</SelectItem>
                                    <SelectItem value="CHANGE_REQUEST_PRIORITY">Cambiar Prioridad de Solicitud</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            {(action.type === 'REQUIRE_ADDITIONAL_STEP' || action.type === 'ROUTE_TO_STEP') && (
                                <><Label>Paso de Destino</Label>
                                <Select value={(action as any).stepId} onValueChange={(v) => setAction(a => ({ ...a, stepId: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione un paso..." /></SelectTrigger>
                                    <SelectContent>{steps.map(step => <SelectItem key={step.id} value={step.id}>{step.name}</SelectItem>)}</SelectContent>
                                </Select></>
                            )}
                            {action.type === 'ASSIGN_USER' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-2">
                                        <Label>Tarea</Label>
                                        <Select value={(action as any).stepId} onValueChange={(v) => setAction(a => ({ ...a, stepId: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione tarea..." /></SelectTrigger>
                                            <SelectContent>{steps.map(step => <SelectItem key={step.id} value={step.id}>{step.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Usuario</Label>
                                        <Select value={(action as any).userId} onValueChange={(v) => setAction(a => ({ ...a, userId: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione usuario..." /></SelectTrigger>
                                            <SelectContent>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                            {action.type === 'SEND_NOTIFICATION' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-2">
                                        <Label>Destinatario</Label>
                                        <Select value={(action as any).target} onValueChange={(v) => setAction(a => ({ ...a, target: v }) as Partial<RuleAction>)}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="submitter">Creador de la solicitud</SelectItem>
                                                <SelectItem value="Admin">Admin</SelectItem>
                                                <SelectItem value="Member">Miembro</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Mensaje</Label>
                                        <Input placeholder="Tu mensaje aquí" value={(action as any).message || ''} onChange={(e) => setAction(a => ({ ...a, message: e.target.value }) as Partial<RuleAction>)} />
                                    </div>
                                </div>
                            )}
                            {action.type === 'CHANGE_REQUEST_PRIORITY' && (
                                <><Label>Nueva Prioridad</Label>
                                <Select value={(action as any).priority} onValueChange={(v) => setAction(a => ({ ...a, priority: v }) as Partial<RuleAction>)}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione prioridad..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Alta">Alta</SelectItem>
                                        <SelectItem value="Media">Media</SelectItem>
                                        <SelectItem value="Baja">Baja</SelectItem>
                                    </SelectContent>
                                </Select></>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="ghost" onClick={onClose}>Cancelar</Button></DialogClose>
                <Button onClick={handleSubmit}>{isEditing ? "Guardar Cambios" : "Añadir Regla"}</Button>
            </DialogFooter>
        </DialogContent>
    );
}
