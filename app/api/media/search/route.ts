import { z } from "zod";
import { getMediaProvider } from "../../../../lib/media";
import { reviewMediaPhotos } from "../../../../lib/media/review";
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

    // 缓存 key 必须带 provider，否则切换图库后会命中另一家的旧结果；v=3 起不再按比例筛选。
    const orientation = input.orientation;
    const cacheKey = new Request(
      `https://media-cache.local/search?v=3&p=${provider.name}&q=${encodeURIComponent(input.query.toLowerCase())}&o=${orientation ?? "all"}`,
    );
    const cache = getDefaultCache();
    const cached = cache ? await cache.match(cacheKey) : undefined;
    if (cached) {
      const data = (await cached.json()) as Record<string, unknown>;
      return json({ ...data, cached: true, configured: true, provider: provider.name });
    }

    const result = await provider.searchPhotos(input.query, {
      // 不再按比例筛选，取一批做地点冲突审查后按相关性排序即可，没必要拉满。
      perPage: 60,
      orientation,
    });
    const reviewed = { ...result, photos: reviewMediaPhotos(input.query, result.photos, 10) };
    if (cache) {
      const response = Response.json(reviewed, {
        headers: { "cache-control": "public, max-age=86400" },
      });
      await cache.put(cacheKey, response.clone());
    }
    return json({ ...reviewed, configured: true, provider: provider.name });
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
