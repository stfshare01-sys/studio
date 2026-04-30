// =========================================================================
// FORMATO DE TEXTO PARA PRE-NÓMINA (NomiPAQ)
// =========================================================================

/**
 * Mapa de caracteres acentuados a sin acento
 */
const ACCENT_MAP: Record<string, string> = {
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'á': 'A', 'é': 'E', 'í': 'I', 'ó': 'O', 'ú': 'U',
    'Ñ': 'N', 'ñ': 'N',
    'Ü': 'U', 'ü': 'U'
};

/**
 * Normaliza texto para pre-nómina:
 * - Convierte a MAYÚSCULAS
 * - Elimina acentos y sustituye Ñ por N
 * - Elimina caracteres especiales (solo letras, números y espacios)
 * - Normaliza espacios múltiples
 *
 * @param text - Texto original
 * @returns Texto normalizado para NomiPAQ
 */
export function normalizeTextForPayroll(text: string): string {
    if (!text) return '';

    let normalized = text.toUpperCase();

    for (const [accented, plain] of Object.entries(ACCENT_MAP)) {
        normalized = normalized.replace(new RegExp(accented, 'g'), plain);
    }

    normalized = normalized.replace(/[^A-Z0-9\s]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Formatea el nombre para pre-nómina en formato APELLIDOS, NOMBRE.
 * Asume estructura: NOMBRE(S) APELLIDO_PATERNO APELLIDO_MATERNO.
 *
 * @param fullName - Nombre completo
 * @returns Nombre formateado para NomiPAQ
 */
export function formatNameForPayroll(fullName: string): string {
    const normalized = normalizeTextForPayroll(fullName);
    const parts = normalized.split(' ');

    if (parts.length <= 2) {
        return normalized;
    }

    const names = parts.slice(0, -2).join(' ');
    const surnames = parts.slice(-2).join(' ');

    return `${surnames}, ${names}`;
}

/**
 * Genera el texto de celda para una entrada de pre-nómina.
 * Ejemplos de salida: "3HE2, 0.5HE3", "DL, PD", "ASI"
 *
 * @param entry - Datos del día con código primario y horas extra
 * @returns Texto para mostrar en la celda de pre-nómina
 */
export function generateCellDisplay(entry: {
    primaryCode: string;
    additionalCodes?: string[];
    overtimeDoubleHours?: number;
    overtimeTripleHours?: number;
}): string {
    const parts: string[] = [];

    if (entry.overtimeDoubleHours && entry.overtimeDoubleHours > 0) {
        parts.push(`${entry.overtimeDoubleHours}HE2`);
    }
    if (entry.overtimeTripleHours && entry.overtimeTripleHours > 0) {
        parts.push(`${entry.overtimeTripleHours}HE3`);
    }

    if (parts.length === 0) {
        if (entry.primaryCode === 'DL' || entry.primaryCode === 'PD') {
            parts.push(entry.primaryCode);
        } else if (entry.primaryCode !== 'ASI' || !entry.additionalCodes?.length) {
            parts.push(entry.primaryCode);
        }
    }

    if (entry.additionalCodes) {
        for (const code of entry.additionalCodes) {
            if (!parts.includes(code)) {
                parts.push(code);
            }
        }
    }

    return parts.join(', ');
}

/**
 * Formatea un número como moneda MXN.
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}
