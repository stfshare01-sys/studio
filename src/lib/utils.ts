import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseFirebaseDate(date: any): Date {
  if (!date) return new Date(NaN);
  if (date instanceof Date) return date;
  if (typeof date === 'object' && 'toDate' in date) return date.toDate();
  if (typeof date === 'string' || typeof date === 'number') return new Date(date);
  return new Date(NaN);
}
