import { NextResponse, type NextRequest } from "next/server";
import { splitLocale, localePath } from "./presentation/localization.mjs";

export async function proxy(request: NextRequest) {
  const { path, locale } = splitLocale(request.nextUrl.pathname);
  if (path.replace(/\/$/, "") === "/admin/submissions")
    return NextResponse.redirect(
      new URL("/admin/stations/submissions/", request.url),
      301,
    );
  if (/^\/(admin|publisher)\/?$/.test(path))
    return NextResponse.redirect(
      new URL(path.replace(/\/$/, "") + "/dashboard/", request.url),
    );
  if (/^\/stations\/[^/]+\/$/.test(path)) {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/v1/public/redirect/?path=${encodeURIComponent(path)}`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) {
      const { destination } = await response.json();
      if (
        typeof destination === "string" &&
        /^\/stations\/[a-z0-9-]+\/$/.test(destination)
      )
        return NextResponse.redirect(
          new URL(
            localePath(destination, locale) + request.nextUrl.search,
            request.url,
          ),
          301,
        );
    }
  }
  const forwarded = new Headers(request.headers);
  forwarded.set("x-kugni-locale", locale);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ["/((?!api/|_next/|assets/|uploads/|.*\\.[^/]+$).*)"],
};
