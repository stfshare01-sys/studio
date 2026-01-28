import { Incidence, Employee } from '@/lib/types';
import { format } from 'date-fns';

/**
 * Interface definition for the NomiPAQ export row
 * Adjust fields based on specific NomiPAQ version requirements
 */
export interface NomipaqExportRow {
    employeeId: string;      // Clave del empleado
    conceptCode: string;     // Clave del concepto de nómina (incidencia)
    date: string;            // Fecha de aplicación
    units: number;           // Unidades (días/horas)
    value: number;           // Valor (0 para incidencias, montos para percepciones - aquí solo incidencias)
    reference: string;       // Referencia o folio
}

/**
 * Maps system incidence types to NomiPAQ concept codes
 * These codes should be configurable or match the client's NomiPAQ setup
 */
const NOMIPAQ_CONCEPT_MAP: Record<string, string> = {
    'vacation': '001',           // Ejemplo: Vacaciones
    'sick_leave': '002',         // Ejemplo: Incapacidad Enfermedad General
    'personal_leave': '003',     // Ejemplo: Permiso con goce
    'maternity': '004',          // Ejemplo: Incapacidad Maternidad
    'paternity': '005',          // Ejemplo: Permiso Paternidad
    'bereavement': '006',        // Ejemplo: Permiso Defunción
    'unjustified_absence': '007',// Ejemplo: Falta Injustificada
    'other': '999'
};

/**
 * Generates a clean CSV string from an array of objects
 */
function generateCSV(data: any[]): string {
    if (!data || data.length === 0) return '';

    const header = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(val => `"${val}"`).join(','));

    return [header, ...rows].join('\n');
}

/**
 * Transforms incidence data into NomiPAQ importable format
 * 
 * @param incidences List of incidences to export
 * @returns CSV string
 */
export function generateNomipaqIncidenceReport(incidences: Incidence[]): string {
    const exportRows: NomipaqExportRow[] = incidences.map(inc => ({
        employeeId: inc.employeeId, // Asumiendo que el ID es la clave interna
        conceptCode: NOMIPAQ_CONCEPT_MAP[inc.type] || '999',
        date: format(new Date(inc.startDate), 'dd/MM/yyyy'),
        units: inc.totalDays,
        value: 0, // Solo reportamos la incidencia, el sistema de nómina calcula el descuento/pago
        reference: inc.id.substring(0, 8) // Folio corto
    }));

    return generateCSV(exportRows);
}

/**
 * Triggers a browser download for the generated CSV
 */
export function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
