import { z } from "zod";
import { getMediaProvider } from "../../../../lib/media";
import { json, requireApiUser } from "../../_shared";

const schema = z.object({
  query: z.string().min(2).max(120),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
});

function getDefaultCache(): Cache | null {
  const cacheStorage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined;
  return cacheStorage?.default ?? null;
}

export async function POST(request: Request) {
  const auth=await requireApiUser(request);
  if(auth instanceof Response)return auth;
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return json({ code: "INVALID_REQUEST", error: "请输入 2-120 个字符的搜索词" }, { status: 400 });
  }
  try {
    const provider = getMediaProvider();
    if (!provider) {
      return json({
        configured: false,
        photos: [],
        message: "真实图片搜索尚未配置，可以先使用本人素材。",
      });
    }

    // 缓存 key 必须带 provider，否则切换图库后会命中另一家的旧结果。
    const cacheKey = new Request(
      `https://media-cache.local/search?p=${provider.name}&q=${encodeURIComponent(input.query.toLowerCase())}&o=${input.orientation || ""}`,
    );
    const cache = getDefaultCache();
    const cached = cache ? await cache.match(cacheKey) : undefined;
    if (cached) {
      const data = (await cached.json()) as Record<string, unknown>;
      return json({ ...data, cached: true, configured: true, provider: provider.name });
    }

    const result = await provider.searchPhotos(input.query, {
      perPage: 10,
      orientation: input.orientation,
    });
    if (cache) {
      const response = Response.json(result, {
        headers: { "cache-control": "public, max-age=86400" },
      });
      await cache.put(cacheKey, response.clone());
    }
    return json({ ...result, configured: true, provider: provider.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return json(
      {
        code: "MEDIA_SEARCH_FAILED",
        error: message.includes("额度")
          ? "图库当前额度或频率受限，请稍后再试；本人素材仍可正常使用。"
          : "图库图片搜索暂时失败，请稍后重试；本人素材仍可正常使用。",
      },
      { status: 503 },
    );
  }
}
