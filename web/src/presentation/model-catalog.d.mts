export interface ModelBrand {
  key: string;
  label: string;
  file: string;
  pattern: RegExp;
  mono: boolean;
}
export interface ModelChoice {
  id: string;
  brand: string;
  label: string;
  providers: number;
}
export const modelBrands: ModelBrand[];
export function groupModelChoices<T extends { id: string; brand?: string }>(
  choices: T[],
): T[];
export function modelBrand(value: string, hint?: string): ModelBrand | null;
export function modelBrandIcon(
  value: string,
  cls?: string,
  hint?: string,
): string;
export function collectModelChoices(payload: unknown): ModelChoice[];
export function configuredModelChoices(payload: unknown): ModelChoice[];
export function renderModelField(
  choices: ModelChoice[],
  options: { id: string; value?: string; label?: string },
): string;
export function matchModelProviders<
  T extends {
    models?: string[];
    publicModelTable?: { rows?: { cells?: string[] }[] };
  },
>(
  model: {
    modelId?: string;
    organization?: { organizationId?: string; nameEn?: string };
  },
  sites: T[],
): { exact: T[]; related: T[]; brand: string };
