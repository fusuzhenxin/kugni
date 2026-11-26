import "server-only";
import { cache } from "react";
import { getPublicPayload } from "./public-data";
import { editorial } from "./editorial";
import { createPresentation } from "@/presentation/render.mjs";
import { createLocalizer } from "@/presentation/localization.mjs";
import type { Station } from "./types";
import { importedCatalogMeta } from "@/presentation/templates/imported-catalog.mjs";

export const privatePublicPath = (path: string) =>
  /^\/(account|auth|compare)(\/|$)/.test(path) ||
  /^\/tools\/(history|.*reports?)(\/|$)/.test(path);
const toolNames: Record<string, string> = {
  "/tools/api-check": "中转站检测",
  "/tools/candy-test": "糖果测试",
  "/tools/model-fingerprint": "模型指纹测试",
};
const toolDescriptions: Record<string, string> = {
  "/tools/api-check":
    "检测 AI API 的可用性、响应耗时与流式输出，支持多种接口协议，查看请求证据和可分享报告。",
  "/tools/candy-test":
    "使用固定题目测试模型回答，查看各项得分、逐题答案与解释，分享本轮糖果测试报告。",
  "/tools/model-fingerprint":
    "采集模型数字回答并对照可信指纹基线，查看候选差异、样本证据与无法判定的情况。",
};

export const getPublicSEO = cache(async (path: string) => {
  const payload = await getPublicPayload(path);
  const { catalog, content } = payload;
  const imported = importedCatalogMeta(payload);
  if (imported) {
    const preview = createPresentation({ ...payload, locale: "en" });
    const missing = preview.missingTranslations;
    return {
      title: imported.title,
      description: imported.description.slice(0, 180),
      keywords: [
        imported.item?.modelId || imported.item?.name || imported.title,
        "AI模型",
        "模型套餐",
        "参数与价格",
      ],
      english: {
        title: imported.englishTitle,
        description: imported.englishDescription.slice(0, 320),
        keywords: ["AI models", "model specifications", "AI subscriptions"],
      },
      allowIndex: true,
      englishReady:
        missing.length === 0 &&
        !!preview.main &&
        !!imported.englishDescription &&
        !/[\u3400-\u9fff]/.test(
          imported.englishTitle + imported.englishDescription,
        ),
      missing,
    };
  }
  let title = "",
    description = "",
    keywords: string[] = [],
    allowIndex = !privatePublicPath(path);
  if (/^\/stations\/[^/]+$/.test(path)) {
    const station = payload.stations.find(
      (s) => s.slug === path.split("/").at(-1),
    ) as Station;
    title = String(
      station.seoTitle || station.name + " · 模型、价格与服务资料",
    );
    description = String(station.seoDescription || station.summary);
    keywords = [station.name, "API中转站", ...station.models];
  } else if (path.startsWith("/stations/categories/")) {
    const category = catalog.categories.find(
      (c) => c.slug === path.split("/").at(-1),
    )!;
    title = String(category.title || category.name);
    description = String(category.description || "");
  } else if (/^\/models\/[^/]+$/.test(path)) {
    const model = catalog.models.find(
      (m) => m.slug === path.split("/").at(-1),
    )!;
    title = model.name + " 模型生态与服务商";
    description = String(
      model.summary || "核对模型生态、公开资料与服务商支持范围。",
    );
  } else {
    title = String(
      content.seo?.title ||
        editorial[path]?.title ||
        toolNames[path] ||
        content.page?.title ||
        (path === "/models" ? "模型资料库" : "KUGNI 服务发现"),
    );
    description = String(
      content.seo?.description ||
        editorial[path]?.description ||
        (toolNames[path]
          ? toolDescriptions[path]
          : content.page?.description ||
            "发现 AI API 服务商，核对公开报价和模型支持。"),
    );
    keywords = content.seo?.keywords
      ? String(content.seo.keywords)
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : content.page?.keywords || [];
    allowIndex &&= content.seo?.index !== "否";
  }
  if (privatePublicPath(path))
    title = path.includes("points")
      ? "积分中心"
      : path.includes("report")
        ? "检测报告"
        : path.startsWith("/auth")
          ? "账户登录与注册"
          : "个人中心";
  const en = createLocalizer(
    "en",
    payload.translations,
    payload.pendingTranslations,
  );
  const english = {
    title: en.text(title, true),
    description: en.text(description, true).slice(0, 320),
    keywords: keywords.map((word) => en.text(word, true)),
  };
  const preview = createPresentation({ ...payload, locale: "en" });
  const missing = [...new Set([...preview.missingTranslations, ...en.missing])];
  return {
    title,
    description: description.slice(0, 180),
    keywords,
    english,
    allowIndex,
    englishReady: missing.length === 0 && !!preview.main,
    missing,
  };
});
