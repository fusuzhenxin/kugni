import { RestoredPublicPage } from "@/components/public-server";
import type { Metadata } from "next";
import { canonical } from "@/lib/server-api";
import { getPublicSEO } from "@/lib/public-seo";
import { splitLocale, localePath } from "@/presentation/localization.mjs";

type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const revalidate = 120;

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { locale, path } = splitLocale(
    "/" + ((await params).path || []).join("/"),
  );
  const query = await searchParams;
  const seo = await getPublicSEO(path);
  const english = locale === "en";
  const copy = english ? seo.english : seo;
  let title = copy.title;
  if (query.page && query.page !== "1")
    title += english
      ? " · Page " + String(query.page).slice(0, 5)
      : " · 第 " + String(query.page).slice(0, 5) + " 页";
  const url =
    canonical(localePath(path, locale)) +
    (query.page && query.page !== "1"
      ? "?page=" + encodeURIComponent(String(query.page))
      : "");
  const filtered = !!(
    query.q ||
    query.model ||
    query.payment ||
    query.sort ||
    query.provider ||
    query.type ||
    query.capability ||
    query.token
  );
  const siblings = seo.allowIndex && seo.englishReady && !filtered;
  return {
    title,
    description: copy.description,
    keywords: copy.keywords,
    alternates: {
      canonical: url,
      ...(siblings
        ? {
            languages: {
              "zh-CN": canonical(path),
              en: canonical(localePath(path, "en")),
              "x-default": canonical(path),
            },
          }
        : {}),
    },
    robots: {
      index: seo.allowIndex && !filtered && (!english || seo.englishReady),
      follow: seo.allowIndex,
    },
    openGraph: {
      title,
      description: copy.description,
      url,
      locale: english ? "en_US" : "zh_CN",
      alternateLocale: english ? "zh_CN" : "en_US",
      images: [{ url: "/assets/og/site.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.description,
    },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ path: parts }, query] = await Promise.all([params, searchParams]);
  const { path, locale } = splitLocale("/" + (parts || []).join("/"));
  return <RestoredPublicPage path={path} locale={locale} query={query} />;
}
