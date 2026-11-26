import type { MetadataRoute } from "next";
import { serverApi, canonical } from "@/lib/server-api";
import { getPublicSEO } from "@/lib/public-seo";
import { localePath } from "@/presentation/localization.mjs";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await serverApi<{
    items: {
      path: string;
      updated: string | null;
      direct?: boolean;
      englishReady?: boolean;
    }[];
  }>("/public/sitemap/", ["sitemap", "stations", "models", "content"]);
  const result: MetadataRoute.Sitemap = [];
  // Inspect the same server-rendered content used by metadata. Incomplete English
  // pages are omitted rather than advertising thin or untranslated pages.
  for (let index = 0; index < data.items.length; index += 6) {
    const batch = await Promise.all(
      data.items.slice(index, index + 6).map(async (row) => {
        const path = row.path.replace(/\/$/, "") || "/";
        const seo = row.direct
          ? { allowIndex: true, englishReady: !!row.englishReady }
          : await getPublicSEO(path).catch(() => {
              // A record can be unpublished between loading the sitemap and its
              // content. Keep other published URLs available during that race.
              console.warn("Skipping unavailable sitemap entry:", path);
              return null;
            });
        if (!seo?.allowIndex) return [];
        const urls = seo.englishReady ? [path, localePath(path, "en")] : [path];
        return urls.map((url): MetadataRoute.Sitemap[number] => ({
          url: canonical(url),
          ...(row.updated ? { lastModified: new Date(row.updated) } : {}),
          changeFrequency: path === "/" ? "daily" : "weekly",
          priority:
            path === "/" ? 1 : path.startsWith("/stations/") ? 0.8 : 0.6,
          ...(seo.englishReady
            ? {
                alternates: {
                  languages: {
                    "zh-CN": canonical(path),
                    en: canonical(localePath(path, "en")),
                    "x-default": canonical(path),
                  },
                },
              }
            : {}),
        }));
      }),
    );
    result.push(...batch.flat());
  }
  return result;
}
