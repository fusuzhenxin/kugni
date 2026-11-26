import { PublicSite } from "./public-controller";
import { JsonLD } from "./public-pages";
import { getPublicPayload } from "@/lib/public-data";
import { canonical } from "@/lib/server-api";
import { createLocalizer, localePath } from "@/presentation/localization.mjs";
import { importedCatalogMeta } from "@/presentation/templates/imported-catalog.mjs";

export async function RestoredPublicPage({
  path,
  query,
  locale = "zh-CN",
}: {
  path: string;
  query: Record<string, string | string[] | undefined>;
  locale?: string;
}) {
  const payload = await getPublicPayload(path, locale);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (typeof value === "string") params.set(key, value);
  const t = createLocalizer(locale, payload.translations).text;
  const imported = importedCatalogMeta(payload);
  return (
    <>
      <PublicSite payload={{ ...payload, query: params.toString() }} />
      <JsonLD
        data={{
          "@context": "https://schema.org",
          "@type":
            imported?.kind === "model"
              ? "SoftwareApplication"
              : imported?.kind === "product"
                ? "Product"
                : path === "/"
                  ? "WebSite"
                  : imported
                    ? "CollectionPage"
                    : "WebPage",
          name: imported
            ? locale === "en"
              ? imported.englishTitle
              : imported.title
            : t(payload.content.page?.title || "KUGNI"),
          ...(imported
            ? {
                description:
                  locale === "en"
                    ? imported.englishDescription
                    : imported.description,
              }
            : {}),
          ...(imported?.kind === "model"
            ? {
                applicationCategory: "AI model",
                operatingSystem: "Cloud API",
                identifier: imported.item.modelId,
              }
            : {}),
          inLanguage: locale,
          url: canonical(localePath(path, locale)),
        }}
      />
    </>
  );
}
