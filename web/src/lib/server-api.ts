import "server-only";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function serverApi<T>(
  path: string,
  tags: string[] = [],
  revalidate = 120,
): Promise<T> {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/v1${path}`,
    { next: { revalidate, tags } },
  );
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 404 ? "页面不存在" : "数据服务暂不可用",
    );
  return response.json() as Promise<T>;
}

export const siteURL = process.env.SITE_URL || "https://www.kugni.com";
export const canonical = (path: string) =>
  siteURL + (path === "/" ? "/" : path.replace(/\/$/, "") + "/");
