import type { Metadata } from "next";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { PageTracker } from "@/components/track";
import { siteURL } from "@/lib/server-api";
import "@/styles/platform.css";
import "./foundation.css";
import "@/styles/operational.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteURL),
  title: {
    default: "KUGNI · AI API 服务发现与中转站导航",
    template: "%s · KUGNI",
  },
  description:
    "发现 AI API 服务商，核对模型、公开报价与服务政策，查看真实检测依据。",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    siteName: "KUGNI",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/assets/og/site.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale =
    (await headers()).get("x-kugni-locale") === "en" ? "en" : "zh-CN";
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main">
          {locale === "en" ? "Skip to content" : "跳到正文"}
        </a>
        <Providers>
          {children}
          <PageTracker />
        </Providers>
      </body>
    </html>
  );
}
