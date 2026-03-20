const dateStr = "2026-03-05";
const [y, m, d] = dateStr.split('-').map(Number);
// Crear en hora local, a medio día para evitar cualquier cambio por horario de verano
const requestDate = new Date(y, m - 1, d, 12, 0, 0); 
console.log("Local getDay:", requestDate.getDay()); // Debe ser 4 (Jueves)
console.log("Local getDate:", requestDate.getDate()); // Debe ser 5

let resetDay = 0; // Sunday
const dayOfWeek = requestDate.getDay();
let diffToStart = requestDate.getDate() - dayOfWeek + resetDay;
if (dayOfWeek < resetDay) {
    diffToStart -= 7;
}

const weekStart = new Date(requestDate);
weekStart.setDate(diffToStart);
const weekEnd = new Date(weekStart);
weekEnd.setDate(weekStart.getDate() + 6);

const formatLocal = (dt) => {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const startStr = formatLocal(weekStart);
const endStr = formatLocal(weekEnd);

console.log("Week Start:", startStr);
console.log("Week End:", endStr);
