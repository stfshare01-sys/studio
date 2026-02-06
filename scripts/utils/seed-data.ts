
const NOW = new Date().toISOString();
const formatDate = (d: Date) => d.toISOString().split('T')[0];

export const SEED_TEMPLATES = [
    // Solicitud de Vacaciones
    {
        id: 'tpl-vacaciones',
        name: 'Solicitud de Vacaciones',
        description: 'Proceso para solicitar días de vacaciones con aprobación del jefe directo y RH.',
        fields: [
            { id: 'fecha_inicio', label: 'Fecha de Inicio', type: 'date', required: true },
            { id: 'fecha_fin', label: 'Fecha de Fin', type: 'date', required: true },
            { id: 'dias_totales', label: 'Días Totales', type: 'number', readOnly: true },
            { id: 'motivo', label: 'Motivo', type: 'textarea', placeholder: 'Describa el motivo de sus vacaciones...' },
            { id: 'contacto_emergencia', label: 'Contacto de Emergencia', type: 'text' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 48, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-2', name: 'Validación RH', type: 'task', assigneeRole: 'HRManager', slaHours: 24 },
        ],
        rules: [],
    },
    // Solicitud de Reembolso
    {
        id: 'tpl-reembolso',
        name: 'Solicitud de Reembolso',
        description: 'Proceso para solicitar reembolso de gastos con comprobantes.',
        fields: [
            { id: 'tipo_gasto', label: 'Tipo de Gasto', type: 'select', options: ['Transporte', 'Alimentación', 'Hospedaje', 'Material de Oficina', 'Otro'], required: true },
            { id: 'monto', label: 'Monto Total (MXN)', type: 'number', required: true },
            { id: 'fecha_gasto', label: 'Fecha del Gasto', type: 'date', required: true },
            { id: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
            { id: 'comprobantes', label: 'Comprobantes', type: 'file' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 72, outcomes: ['Aprobar', 'Rechazar', 'Solicitar más información'] },
            { id: 'step-2', name: 'Revisión Contabilidad', type: 'task', assigneeRole: 'Admin', slaHours: 48 },
        ],
        rules: [],
    },
    // Permiso de Ausencia
    {
        id: 'tpl-permiso-ausencia',
        name: 'Permiso de Ausencia',
        description: 'Solicitud de permiso para ausencia justificada (cita médica, trámite personal, etc.).',
        fields: [
            { id: 'tipo_permiso', label: 'Tipo de Permiso', type: 'select', options: ['Cita Médica', 'Trámite Personal', 'Asunto Familiar', 'Otro'], required: true },
            { id: 'fecha', label: 'Fecha', type: 'date', required: true },
            { id: 'hora_salida', label: 'Hora de Salida', type: 'text', placeholder: 'Ej: 10:00' },
            { id: 'hora_regreso', label: 'Hora de Regreso', type: 'text', placeholder: 'Ej: 14:00' },
            { id: 'justificacion', label: 'Justificación', type: 'textarea', required: true },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 24, outcomes: ['Aprobar', 'Rechazar'] },
        ],
        rules: [],
    },
    // Alta de Proveedor
    {
        id: 'tpl-alta-proveedor',
        name: 'Alta de Proveedor',
        description: 'Proceso para dar de alta un nuevo proveedor en el sistema.',
        fields: [
            { id: 'razon_social', label: 'Razón Social', type: 'text', required: true },
            { id: 'rfc', label: 'RFC', type: 'text', required: true },
            { id: 'direccion', label: 'Dirección Fiscal', type: 'textarea', required: true },
            { id: 'contacto_nombre', label: 'Nombre de Contacto', type: 'text', required: true },
            { id: 'contacto_email', label: 'Email de Contacto', type: 'email', required: true },
            { id: 'contacto_telefono', label: 'Teléfono', type: 'text' },
            { id: 'tipo_servicio', label: 'Tipo de Servicio', type: 'select', options: ['Materiales', 'Servicios', 'Logística', 'Tecnología', 'Otro'], required: true },
        ],
        steps: [
            { id: 'step-1', name: 'Revisión Compras', type: 'task', assigneeRole: 'Member', slaHours: 48 },
            { id: 'step-2', name: 'Aprobación Gerente', type: 'task', assigneeRole: 'Manager', slaHours: 72, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-3', name: 'Registro en Sistema', type: 'task', assigneeRole: 'Admin', slaHours: 24 },
        ],
        rules: [],
    },
    // Requisición de Compra
    {
        id: 'tpl-requisicion',
        name: 'Requisición de Compra',
        description: 'Solicitud de compra de materiales o servicios.',
        fields: [
            { id: 'departamento', label: 'Departamento Solicitante', type: 'select', options: ['Operaciones', 'Administración', 'Recursos Humanos', 'Tecnología', 'Dirección'], required: true },
            { id: 'descripcion_items', label: 'Descripción de lo Solicitado', type: 'textarea', required: true },
            { id: 'cantidad', label: 'Cantidad', type: 'number', required: true },
            { id: 'urgencia', label: 'Urgencia', type: 'select', options: ['Baja', 'Media', 'Alta', 'Crítica'], required: true },
            { id: 'justificacion', label: 'Justificación', type: 'textarea', required: true },
            { id: 'proveedor_sugerido', label: 'Proveedor Sugerido (opcional)', type: 'text' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Área', type: 'task', assigneeRole: 'Manager', slaHours: 48, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-2', name: 'Cotización Compras', type: 'task', assigneeRole: 'Member', slaHours: 72 },
            { id: 'step-3', name: 'Aprobación Final', type: 'task', assigneeRole: 'Admin', slaHours: 48, outcomes: ['Autorizar', 'Rechazar'] },
        ],
        rules: [],
    },
];

export const SEED_SAMPLE_INCIDENCES = [
    // Pendiente - Vacaciones
    {
        id: 'inc-pending-vacation-1',
        employeeId: 'emp-dev',
        employeeName: 'Daniela Jiménez Pineda',
        type: 'vacation',
        startDate: formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)), // +14 days
        endDate: formatDate(new Date(Date.now() + 18 * 24 * 60 * 60 * 1000)), // +18 days
        totalDays: 5,
        isPaid: true,
        status: 'pending',
        notes: 'Vacaciones familiares programadas',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    // Pendiente - Permiso Personal
    {
        id: 'inc-pending-personal-1',
        employeeId: 'emp-vendedor-1',
        employeeName: 'Lucía Méndez Solís',
        type: 'personal_leave',
        startDate: formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // +7 days
        endDate: formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // +7 days
        totalDays: 1,
        isPaid: false,
        status: 'pending',
        notes: 'Cita médica',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    // Aprobada - Vacaciones
    {
        id: 'inc-approved-vacation-1',
        employeeId: 'emp-analista-rh',
        employeeName: 'Sandra López Gutiérrez',
        type: 'vacation',
        startDate: formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), // -7 days
        endDate: formatDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), // -3 days
        totalDays: 5,
        isPaid: true,
        status: 'approved',
        approvedById: 'emp-coord-rh',
        approvedByName: 'Ana Gabriela Soto Martínez',
        approvedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Viaje familiar',
        createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // Aprobada - Incapacidad
    {
        id: 'inc-approved-sick-1',
        employeeId: 'emp-almacen-1',
        employeeName: 'José Luis Ríos Silva',
        type: 'sick_leave',
        startDate: formatDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), // -10 days
        endDate: formatDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)), // -8 days
        totalDays: 3,
        isPaid: true,
        status: 'approved',
        approvedById: 'emp-super-almacen',
        approvedByName: 'Miguel Ángel Rojas Vargas',
        approvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Incapacidad por enfermedad respiratoria',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
];

export const SEED_MASTER_LISTS = [
    {
        id: 'ml-incidence-types',
        name: 'Tipos de Incidencia',
        description: 'Catálogo de tipos de incidencia para solicitudes',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'isPaid', label: 'Con Goce', type: 'boolean' },
            { id: 'maxDays', label: 'Días Máximos', type: 'number' }
        ],
        primaryKey: 'id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'ml-expense-categories',
        name: 'Categorías de Gasto',
        description: 'Categorías para solicitudes de reembolso',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'requiresReceipt', label: 'Requiere Factura', type: 'boolean' },
            { id: 'maxAmount', label: 'Monto Máximo', type: 'number' }
        ],
        primaryKey: 'id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'ml-document-types',
        name: 'Tipos de Documento',
        description: 'Catálogo de documentos para expediente digital',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'required', label: 'Obligatorio', type: 'boolean' }
        ],
        primaryKey: 'id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

export const SEED_INCIDENCE_TYPE_ITEMS = [
    { id: 'vacation', name: 'Vacaciones', isPaid: true, maxDays: 40 },
    { id: 'sick_leave', name: 'Incapacidad', isPaid: true, maxDays: 365 },
    { id: 'personal_leave', name: 'Permiso Personal', isPaid: false, maxDays: 3 },
    { id: 'maternity', name: 'Maternidad', isPaid: true, maxDays: 84 },
    { id: 'paternity', name: 'Paternidad', isPaid: true, maxDays: 5 },
    { id: 'bereavement', name: 'Duelo', isPaid: true, maxDays: 3 },
    { id: 'unjustified_absence', name: 'Falta Injustificada', isPaid: false, maxDays: 1 }
];

export const SEED_EXPENSE_CATEGORY_ITEMS = [
    { id: 'transport', name: 'Transporte', requiresReceipt: false, maxAmount: 5000 },
    { id: 'food', name: 'Alimentación', requiresReceipt: true, maxAmount: 1500 },
    { id: 'lodging', name: 'Hospedaje', requiresReceipt: true, maxAmount: 5000 },
    { id: 'supplies', name: 'Insumos', requiresReceipt: true, maxAmount: 3000 },
    { id: 'services', name: 'Servicios', requiresReceipt: true, maxAmount: 10000 },
    { id: 'other', name: 'Otros', requiresReceipt: true, maxAmount: 2000 }
];

export const SEED_DOCUMENT_TYPE_ITEMS = [
    { id: 'ine', name: 'INE / IFE', required: true },
    { id: 'curp', name: 'CURP', required: true },
    { id: 'rfc', name: 'Constancia RFC', required: true },
    { id: 'nss', name: 'Número de Seguro Social', required: true },
    { id: 'comprobante_domicilio', name: 'Comprobante de Domicilio', required: true },
    { id: 'acta_nacimiento', name: 'Acta de Nacimiento', required: false },
    { id: 'comprobante_estudios', name: 'Comprobante de Estudios', required: false },
    { id: 'carta_recomendacion', name: 'Carta de Recomendación', required: false },
    { id: 'contrato_firmado', name: 'Contrato Firmado', required: true },
    { id: 'estado_cuenta', name: 'Estado de Cuenta Bancario', required: true }
];
