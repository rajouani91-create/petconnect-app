import de from './de.json';
import en from './en.json';
import type { LandingContent } from './types';

/** Texte je Sprachcode. Der Typ erzwingt dieselben Schlüssel in jeder Sprache. */
export const CONTENT: Record<string, LandingContent> = {
  de: de as LandingContent,
  en: en as LandingContent,
};

export type { LandingContent } from './types';
