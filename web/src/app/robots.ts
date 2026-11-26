import type { MetadataRoute } from "next";
import { siteURL } from "@/lib/server-api";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/publisher/",
          "/account/",
          "/auth/",
          "/compare/",
          "/tools/history/",
          "/tools/api-check/reports/",
          "/tools/candy-test/report/",
          "/tools/model-fingerprint/report/",
          "/api/",
          "/en/account/",
          "/en/auth/",
          "/en/compare/",
          "/en/tools/history/",
          "/en/tools/api-check/reports/",
          "/en/tools/candy-test/report/",
          "/en/tools/model-fingerprint/report/",
          "/*?q=",
          "/*?token=",
        ],
      },
    ],
    sitemap: siteURL + "/sitemap.xml",
    host: siteURL,
  };
}
