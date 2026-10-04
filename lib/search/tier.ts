/**
 * 来源可信度分级：1 最高（政府/官方机构），5 最低（社交平台）。
 *
 * 三家搜索 Provider 必须共用同一套规则——否则同一个网址经不同 Provider 返回时
 * 会得到不同 tier，直接影响"来源是否足够可靠"的判定结果。
 */
export function sourceTier(url: string): 1 | 2 | 3 | 4 | 5 {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // 1：政府与超国家机构
    if (/\.gov\.|\.gov$|europa\.eu|admin\.ch/.test(host)) return 1;
    // 2：官方铁路 / 航司 / 旅游局 / 博物馆 / 机场
    if (/sbb\.ch|sncf|trenitalia|airfrance|lufthansa|visit[a-z]|tourism|museum|airport/.test(host)) return 2;
    // 3：主流新闻媒体
    if (/reuters|bbc|apnews|ft\.com|nationalgeographic/.test(host)) return 3;
    // 5：社交平台
    if (/instagram|facebook|tiktok|weibo|xiaohongshu/.test(host)) return 5;
    // 4：其余（博客、攻略站、OTA 等），默认不可作为核验依据
    return 4;
  } catch {
    return 4;
  }
}
