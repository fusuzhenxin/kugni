export interface Entity {
  id: string;
  name: string;
  status: string;
  slug?: string | null;
  version?: number;
  [key: string]: unknown;
}

export interface Station extends Entity {
  slug: string;
  domain: string;
  registerUrl?: string;
  summary: string;
  logo?: string;
  category: string;
  categories: string[];
  models: string[];
  payments: string[];
  tags: string[];
  serviceStatus: string;
  sourceDate: string;
  source?: string;
  sourceUptime?: number;
  sourceLatency?: number;
  invoice?: string;
  refund?: string;
  minRecharge?: string | number;
  notices?: Entity[];
  pricing?: Entity[];
  reviews?: Entity[];
  reports?: Entity[];
  sourcePricing?: {
    headers: string[];
    rows: { cells: string[] }[];
    dataAsOf: string;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  surface: string;
  permissions: string[];
  profile: { bio?: string; avatar?: string; [key: string]: unknown };
}

export interface SessionData {
  user: User | null;
  csrf: string | null;
}
export interface Catalog {
  categories: Entity[];
  models: Entity[];
  modelSuggestions?: { modelId: string; sort: number }[];
  settings: Record<string, string>;
  sourceDate: string;
  routes: { id: string; label: string; path: string; index: boolean }[];
}
export interface ListResult<T = Entity> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Content {
  page:
    | (Entity & {
        title: string;
        description: string;
        faq: string[][];
        keywords: string[];
        document?: string[][];
      })
    | null;
  seo: Entity | null;
  article: Entity | null;
}
export interface Field {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  help?: string;
  source?: string;
  suffix?: string;
}
export interface Module {
  key: string;
  title: string;
  group: string;
  icon: string;
  path: string;
  description: string;
  kind: string;
  surface: string;
  permission: string;
  fields: Field[];
  columns: { key: string; label: string }[];
  actions: string[];
  bulkActions: string[];
  bulkFields: string[];
}
export interface AdminContext {
  user: User;
  modules: Module[];
  actions: Record<string, string>;
  choices: Record<string, Entity[]>;
  permissions: {
    code: string;
    module: string;
    title: string;
    action: string;
    group: string;
  }[];
}
export interface Analytics {
  online?: number;
  onlineWindow?: number;
  geoConfigured?: boolean;
  regions?: { name: string; value: number }[];
  livePages?: { name: string; value: number }[];
  paths?: { from: string; to: string; count: number }[];
  funnels?: {
    name: string;
    steps: { name: string; count: number; rate: number; stepRate: number }[];
  }[];
  test?: {
    total: number;
    successful: number;
    successRate: number | null;
    averageScore: number | null;
    averageLatency: number | null;
    scored: number;
    series: { date: string; total: number; successful: number }[];
    models: { name: string; total: number; successful: number }[];
  };
  pv: number;
  uv: number;
  impressions: number;
  clicks: number;
  ctr: number;
  outbound: number;
  averageDuration: number;
  note: string;
  series: {
    date: string;
    pageviews: number;
    visitors: number;
    impressions: number;
    clicks: number;
  }[];
  sources: { name: string; value: number }[];
  pages: { name: string; value: number }[];
  devices: { name: string; value: number }[];
  campaigns: {
    id: string;
    name: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }[];
}

export const text = (value: unknown): string =>
  value == null
    ? "—"
    : Array.isArray(value)
      ? value.map(text).join("、")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
export const dateText = (value: unknown): string =>
  value
    ? new Date(
        /^\d{4}-\d{2}-\d{2}T/.test(String(value)) &&
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(value))
          ? String(value) + "Z"
          : String(value),
      ).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "—";
