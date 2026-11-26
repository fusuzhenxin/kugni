import { siteURL } from "@/lib/server-api";
export function GET() {
  return new Response(
    `# KUGNI\n\nAI API service directory. Preserve source dates and provider links when citing.\n\n- Directory: ${siteURL}/api/v1/public/stations/\n- Models and categories: ${siteURL}/api/v1/public/catalog/\n- Pricing: ${siteURL}/api/v1/public/pricing/\n- Methodology: ${siteURL}/methodology/\n\nInitial directory snapshot: 2026-11-12. Missing prices are unknown, not zero. No uncalibrated model-identity claims.\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
