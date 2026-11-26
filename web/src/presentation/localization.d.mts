export function hasChinese(value: string): boolean;
export function decodeHTML(value: string): string;
export function splitLocale(path: string): { locale: string; path: string };
export function localePath(value: string, locale?: string): string;
export function createLocalizer(
  locale?: string,
  overrides?: Record<string, string>,
  pendingSources?: string[],
): {
  text: (value: string, track?: boolean) => string;
  html: (markup: string, track?: boolean) => string;
  missing: Set<string>;
  dictionary: Record<string, string>;
};
