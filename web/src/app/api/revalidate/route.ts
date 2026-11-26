import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supplied = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from("Bearer " + (process.env.REVALIDATE_SECRET || ""));
  if (
    !process.env.REVALIDATE_SECRET ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tags } = await request.json();
  if (
    !Array.isArray(tags) ||
    tags.length > 50 ||
    tags.some((t) => typeof t !== "string" || t.length > 200)
  )
    return NextResponse.json({ error: "Invalid tags" }, { status: 422 });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags });
}
