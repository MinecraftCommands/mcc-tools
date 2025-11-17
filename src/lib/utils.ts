import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toKebabCase(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function capitalise(str: string): string {
  if (!str[0]) return ""; // Keeps eslint happy
  return str[0].toUpperCase() + str.slice(1);
}

export type Modify<T, R> = Omit<T, keyof R> & R;

export type WithCn<T> = Modify<T, { className?: ClassValue }>;

export type FuzzyAutocomplete<T> = T | (string & {});
