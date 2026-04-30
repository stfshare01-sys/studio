export const formatDateDDMMYYYY = (dateVal: any): string => {
    if (!dateVal) return '';

    // Handle Firestore Timestamp
    if (dateVal && typeof dateVal.toDate === 'function') {
        const d = dateVal.toDate();
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    // Handle Firestore FieldValue
    if (dateVal && typeof dateVal === 'object' && !dateVal.toDate) {
         return 'Procesando...';
    }

    const dateStr = String(dateVal);
    // Soporta YYYY-MM-DD y ISO timestamps
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
};
