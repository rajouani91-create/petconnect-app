// Gestalt der Texte einer Landingpage-Sprache. Eine neue Sprache = eine neue JSON-Datei in site/content/ (gleiche Schlüssel)
// plus ein Eintrag in site/config.ts. Fehlt ein Schlüssel, meldet der Typcheck und der Test site/site.test.ts einen Fehler.

export type IconName = 'bell' | 'folder' | 'alert' | 'users' | 'sun' | 'sparkle';

interface Point {
  title: string;
  text: string;
}

export interface LandingContent {
  meta: { title: string; description: string; ogAlt: string; appDescription: string };
  skip: string;
  nav: { features: string; ai: string; vets: string; how: string; faq: string; login: string; start: string; language: string; home: string };
  hero: { eyebrow: string; title: string; sub: string; cta: string; ctaSecondary: string; note: string; imageAlt: string };
  features: { title: string; intro: string; items: { icon: IconName; title: string; text: string }[] };
  how: { title: string; steps: Point[] };
  gallery: { title: string; note: string; items: { img: 'heute' | 'erinnerungen' | 'tierakte' | 'assistent'; caption: string; alt: string }[] };
  /** Eigener Abschnitt zum KI-Assistenten (Text; die Startansicht steht in der Galerie) */
  ai: { eyebrow: string; title: string; text: string; points: Point[]; note: string };
  trust: { title: string; items: Point[]; note: string; link: string; deleteLink: string };
  vets: { eyebrow: string; title: string; text: string; benefits: Point[]; status: string; cta: string; ctaNote: string; mailSubject: string; mailBody: string };
  faq: { title: string; items: { q: string; a: string }[] };
  final: { title: string; text: string; cta: string };
  footer: { tagline: string; imprint: string; privacy: string; deleteAccount: string; contact: string; legalNote: string; disclaimer: string };
}
