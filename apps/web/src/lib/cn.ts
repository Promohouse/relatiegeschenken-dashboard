import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Voegt klassen samen en laat latere Tailwind-klassen winnen. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
