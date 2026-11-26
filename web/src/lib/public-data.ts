import "server-only";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { serverApi, ApiError } from "./server-api";
import type { Catalog, Content, Entity, ListResult, Station } from "./types";
import type { PublicPayload } from "@/components/public-controller";
import { localePath } from "@/presentation/localization.mjs";

const common = cache(async () => {
  const [catalog, listing, pricing, reports, plans, localization] =
    await Promise.all([
      serverApi<Catalog>("/public/catalog/", [
        "catalog",
        "stations",
        "models",
        "content",
      ]),
      serverApi<ListResult<Station>>("/public/stations/?page_size=100", [
        "stations",
      ]),
      serverApi<{ items: Entity[]; source: Entity[] }>("/public/pricing/", [
        "pricing",
        "stations",
      ]),
      serverApi<{ items: Entity[] }>("/public/reports/", ["stations"], 60),
      serverApi<{ items: Entity[] }>("/public/coding-plans/", ["pricing"]),
      // Translation availability must never block Chinese publishing or rendering.
      serverApi<{
        dictionary: Record<string, string>;
        pendingSources: string[];
      }>("/public/localization/", ["translations", "catalog"]).catch(() => ({
        dictionary: {},
        pendingSources: [],
      })),
    ]);
  return {
    catalog,
    stations: listing.items,
    pricing,
    reports: reports.items,
    plans: plans.items,
    translations: localization.dictionary,
    pendingTranslations: localization.pendingSources,
  };
});

export const getPublicPayload = cache(
  async (path: string, locale = "zh-CN"): Promise<PublicPayload> => {
    try {
      const base = await common();
      const importedModels =
        path === "/models" || path.startsWith("/models/")
          ? await serverApi<{
              items: Entity[];
              total: number;
              updatedAt: string;
            }>(
              "/public/model-directory/" +
                (path.startsWith("/models/")
                  ? "?slug=" + encodeURIComponent(path.slice("/models/".length))
                  : ""),
              ["imported-catalog"],
            )
          : undefined;
      const importedPackages =
        path === "/coding-plans" || path.startsWith("/coding-plans/")
          ? await serverApi<{
              items: Entity[];
              total: number;
              updatedAt: string;
            }>(
              "/public/model-packages/" +
                (path.startsWith("/coding-plans/")
                  ? "?slug=" +
                    encodeURIComponent(path.slice("/coding-plans/".length))
                  : ""),
              ["imported-catalog"],
            )
          : undefined;
      let stations = base.stations;
      const content = await serverApi<Content>(
        "/public/content/?path=" + encodeURIComponent(path),
        ["content"],
      );
      if (/^\/stations\/[^/]+$/.test(path)) {
        const station = await serverApi<Station & { redirect?: string }>(
          "/public/stations/" + path.split("/").at(-1) + "/",
          ["stations", "station:" + path.split("/").at(-1)],
        );
        if (station.redirect)
          permanentRedirect(localePath(station.redirect, locale));
        stations = stations.map((s) => (s.id === station.id ? station : s));
        if (!stations.some((s) => s.id === station.id)) stations.push(station);
      }
      if (
        path.startsWith("/stations/categories/") &&
        !base.catalog.categories.some((c) => c.slug === path.split("/").at(-1))
      )
        notFound();
      if (
        /^\/models\/[^/]+$/.test(path) &&
        !base.catalog.models.some((c) => c.slug === path.split("/").at(-1)) &&
        !importedModels?.items.some((c) => c.slug === path.split("/").at(-1))
      )
        notFound();
      if (
        path.startsWith("/coding-plans/") &&
        !importedPackages?.items.some(
          (c) => c.slug === path.slice("/coding-plans/".length),
        )
      )
        notFound();
      const extra = [
        "/auth/login",
        "/auth/register",
        "/auth/password-reset",
        "/auth/password-reset/confirm",
        "/account",
        "/account/settings",
        "/account/points",
        "/account/invitations",
        "/account/submissions",
        "/account/favorites",
        "/compare/stations",
        "/tools/history",
      ];
      if (
        !base.catalog.routes.some((r) => r.path === path) &&
        !extra.includes(path) &&
        !/^\/stations\/[^/]+$/.test(path) &&
        !/^\/stations\/categories\/[^/]+$/.test(path) &&
        !/^\/models\/[^/]+$/.test(path) &&
        !/^\/coding-plans\/[^/]+\/[^/]+$/.test(path) &&
        !/^\/tools\/api-check\/reports\/[^/]+$/.test(path) &&
        !content.article
      )
        notFound();
      if (/^\/(admin|publisher|en)(\/|$)/.test(path)) notFound();
      return {
        ...base,
        path,
        locale,
        query: "",
        stations,
        content,
        importedModels,
        importedPackages,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }
  },
);
