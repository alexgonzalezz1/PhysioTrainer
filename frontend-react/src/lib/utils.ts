import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPainColor(pain: number): string {
  if (pain <= 3) return 'text-green-600 bg-green-50';
  if (pain <= 5) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

export function getPainBgColor(pain: number): string {
  if (pain <= 3) return 'bg-green-500';
  if (pain <= 5) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function getTrafficLightEmoji(pain: number): string {
  if (pain <= 3) return '🟢';
  if (pain <= 5) return '🟡';
  return '🔴';
}
