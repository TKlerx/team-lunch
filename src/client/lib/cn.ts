import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, letting later (caller-supplied) classes win over
 * conflicting earlier ones. Use this in every themed primitive so a `className`
 * override actually takes effect instead of fighting the base classes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
