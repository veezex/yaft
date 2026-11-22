import { en } from './en.ts';
import { ru } from './ru.ts';

export type Dictionary = typeof en;
export type Locale = 'en' | 'ru';
export type LanguagePreference = Locale | 'auto';
export const dictionaries: Record<Locale, Dictionary> = { en, ru };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ru';
}

export function resolveLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const language = tag.toLowerCase().split('-')[0];
    if (isLocale(language)) return language;
  }
  return 'en';
}

function numberFormats(locale: Locale) {
  return [0, 1, 2].map(digits => new Intl.NumberFormat(locale, {
    useGrouping: false, minimumFractionDigits: digits === 1 ? 1 : 0, maximumFractionDigits: digits,
  }).format);
}

const numbers = { en: numberFormats('en'), ru: numberFormats('ru') };

export function formatNumber(locale: Locale, value: number, digits: 0 | 1 | 2 = 2): string {
  return numbers[locale][digits](value);
}

const russianUnits: Record<string, string> = {
  tf: 'тф', MW: 'МВт', pt: 'ед.', 'm³': 'м³', 'Mbit/s': 'Мбит/с', DPS: 'ед./с',
  HP: 'ед.', EHP: 'эфф. ед.', 'HP/s': 'ед./с', m: 'м', s: 'с', GJ: 'ГДж',
  'GJ/s': 'ГДж/с', 'm/s': 'м/с', 'AU/s': 'а.е./с', mm: 'мм', 'm³/min': 'м³/мин',
};

export function metricUnit(locale: Locale, unit: string): string {
  return locale === 'ru' ? russianUnits[unit] ?? unit : unit;
}

export type LocalizedNames = Readonly<Record<string, string | undefined>>;

export function localizedName(locale: Locale, names?: LocalizedNames): string | undefined {
  return names?.[locale] || names?.en || undefined;
}

type Name = { names: LocalizedNames; fallback: string };
export function nameText(names: LocalizedNames | undefined, fallback: string | number): Text {
  return names ? { names, fallback: String(fallback) } : String(fallback);
}

type MessageKey = keyof Dictionary;
export type LabelKey = {
  [Key in MessageKey]: Dictionary[Key] extends string ? Key : never
}[MessageKey];
type TextArgument = Text | number | undefined;
export type Message = { key: MessageKey; args: readonly TextArgument[] };
export type Text = string | Message | Name;
type MessageArgs<Key extends MessageKey> = Dictionary[Key] extends (...args: infer Args) => string
  ? { [Index in keyof Args]: string extends Args[Index] ? Args[Index] | Text : Args[Index] }
  : [];

export function msg<Key extends MessageKey>(key: Key, ...args: MessageArgs<Key>): Message {
  return { key, args: args as TextArgument[] };
}

export function translate(locale: Locale, text: Text): string {
  if (typeof text === 'string') return text;
  if ('names' in text) return localizedName(locale, text.names) ?? text.fallback;
  const template = dictionaries[locale][text.key];
  if (typeof template === 'string') return template;
  const render = template as (...args: (string | number | undefined)[]) => string;
  return render(...text.args.map(arg => typeof arg === 'object' ? translate(locale, arg) : arg));
}

export class LocalizedError extends Error {
  readonly text: Text;
  constructor(text: Text) {
    super(translate('en', text));
    this.text = text;
  }
}

export function errorText(error: unknown): Text {
  if (error instanceof LocalizedError) return error.text;
  return error instanceof Error ? error.message : String(error);
}
