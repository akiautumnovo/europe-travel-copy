import { z } from "zod";
import { getMediaProvider } from "../../../../lib/media";
import { reviewMediaPhotos } from "../../../../lib/media/review";
import { json, requireApiUser } from "../../_shared";
import { getUserApiKeys,getUserMediaProvider } from "../../../../lib/user-api-keys";
import { getAIProvider } from "../../../../lib/ai";
import { mediaSearchCacheKey, readMediaSearchCache, readStaleMediaSearchCache, singleFlightMediaSearch, writeMediaSearchCache } from "../../../../lib/media/search-cache";

const schema = z.object({
  query: z.string().min(2).max(120),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
});

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
    const keys=await getUserApiKeys(auth.userId),providerName=await getUserMediaProvider(auth.userId),provider = getMediaProvider(providerName,keys[providerName]);
    if (!provider) {
      return json({
        configured: false,
        photos: [],
        message: `请先在账号设置中配置 ${providerName==="unsplash"?"Unsplash":"Pixabay"} API 密钥，也可以继续使用本人素材。`,
      });
    }

    // Node 持久化缓存：provider、检索算法版本、搜索词和方向共同决定命中范围。
    const orientation = input.orientation;
    let searchQuery=input.query.trim();
    if(providerName==="unsplash"&&/[\p{Script=Han}]/u.test(searchQuery)&&keys.deepseek){
      try{searchQuery=await getAIProvider(keys.deepseek).translateMediaQuery(searchQuery)}catch{/* 翻译失败不应阻断图库搜索 */}
    }
    const cacheKey = mediaSearchCacheKey(provider.name,searchQuery,orientation);
    const cached = await readMediaSearchCache(cacheKey);
    if (cached) {
      return json({ ...cached, cached: true, configured: true, provider: provider.name });
    }

    try {
      const reviewed=await singleFlightMediaSearch(cacheKey,async()=>{
        // 双检：等待同请求期间，另一个实例可能已经写入 SQLite。
        const secondHit=await readMediaSearchCache(cacheKey);
        if(secondHit)return secondHit;
        const result = await provider.searchPhotos(searchQuery, {
          // 不再按比例筛选，取一批做地点冲突审查后按相关性排序即可，没必要拉满。
          perPage: 30,
          orientation,
        });
        // 只缓存可公开复用的图片结果，不把某个账号的额度响应头共享给其他账号。
        const value = { photos: reviewMediaPhotos(searchQuery, result.photos, 10) } as Record<string,unknown>;
        await writeMediaSearchCache(cacheKey,value);
        return value;
      });
      return json({ ...reviewed, cached: false, configured: true, provider: provider.name });
    } catch(error) {
      // 外部图库短暂失败时优先返回最近一次旧结果，避免重试继续消耗额度。
      const stale=await readStaleMediaSearchCache(cacheKey);
      if(stale)return json({ ...stale, cached: true, stale: true, configured: true, provider: provider.name });
      throw error;
    }
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
