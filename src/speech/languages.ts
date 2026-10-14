// Spec §4.2 Language & Dialect Specification Matrix.
// `asrBaseModel` documents the production model from the spec; the MVP uses the
// browser's built-in recognizer for the given BCP-47 locale.

export interface LanguageSpec {
  name: string;
  isoCodes: string[];
  asrBaseModel: string;
  /** Target WER from spec §5 (fraction). */
  targetWer: number;
  /** True when the browser recognizer is unlikely to support it (MVP limitation). */
  browserAsrLimited?: boolean;
}

export const LANGUAGE_MATRIX: LanguageSpec[] = [
  { name: 'English', isoCodes: ['en-US', 'en-GB', 'en-AU'], asrBaseModel: 'Conformer-CTC', targetWer: 0.125 },
  { name: 'Mandarin (Chinese)', isoCodes: ['zh-CN'], asrBaseModel: 'Conformer-Transducer', targetWer: 0.125 },
  { name: 'Russian', isoCodes: ['ru-RU'], asrBaseModel: 'Wav2Vec2-XLSR', targetWer: 0.125 },
  { name: 'French', isoCodes: ['fr-FR', 'fr-CA'], asrBaseModel: 'Conformer-CTC', targetWer: 0.125 },
  { name: 'Swahili', isoCodes: ['sw-KE', 'sw-TZ'], asrBaseModel: 'Wav2Vec2-XLSR', targetWer: 0.125 },
  { name: 'Yoruba', isoCodes: ['yo-NG'], asrBaseModel: 'Custom Transducer', targetWer: 0.125, browserAsrLimited: true },
  { name: 'Hindi', isoCodes: ['hi-IN'], asrBaseModel: 'Conformer-CTC', targetWer: 0.125 },
  { name: 'Spanish', isoCodes: ['es-ES', 'es-MX', 'es-US'], asrBaseModel: 'Conformer-Transducer', targetWer: 0.125 },
  // Creole variant: spec allows < 16.0% WER. Browser ASR has no jam-JM model; en-JM is the nearest fallback.
  { name: 'Jamaican Patois', isoCodes: ['jam-JM'], asrBaseModel: 'Fine-tuned XLSR-53', targetWer: 0.16, browserAsrLimited: true },
];

export const ALL_LOCALES = LANGUAGE_MATRIX.flatMap((l) => l.isoCodes);

export function baseLanguage(locale: string): string {
  return locale.split('-')[0].toLowerCase();
}

export function languageFor(locale: string): LanguageSpec | undefined {
  return LANGUAGE_MATRIX.find((l) => l.isoCodes.includes(locale));
}

/** Locale handed to the browser recognizer / voices (fallbacks for unsupported variants). */
export function browserLocale(locale: string): string {
  if (locale === 'jam-JM') return 'en-JM';
  return locale;
}

/**
 * Content modules are authored per base language (e.g. "en", "es"). Jamaican Patois
 * uses English-language content until dedicated modules are authored.
 */
export function contentLanguageFor(locale: string): string {
  if (locale === 'jam-JM') return 'en';
  return baseLanguage(locale);
}
