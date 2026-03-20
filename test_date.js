const dateStr = "2026-03-05";
const requestDate = new Date(dateStr);
console.log("Input:", dateStr);
console.log("UTC Date:", requestDate.toISOString());
console.log("Local getDay:", requestDate.getDay());
console.log("Local getDate:", requestDate.getDate());

let resetDay = 0; // Sunday
const dayOfWeek = requestDate.getDay();
let diffToStart = requestDate.getDate() - dayOfWeek + resetDay;
if (dayOfWeek < resetDay) {
    diffToStart -= 7;
}
const weekStart = new Date(requestDate);
weekStart.setDate(diffToStart);

console.log("Week Start:", weekStart.toISOString());
console.log("Week Start (local):", weekStart.toString());
