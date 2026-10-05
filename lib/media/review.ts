import type { MediaPhoto } from "./types";

const COUNTRY_TERMS = [
  ["austria", "austrian"], ["belgium", "belgian"], ["croatia", "croatian"],
  ["czechia", "czech", "prague"], ["denmark", "danish"], ["finland", "finnish"],
  ["france", "french"], ["germany", "german"], ["greece", "greek"],
  ["hungary", "hungarian"], ["iceland", "icelandic"], ["ireland", "irish"],
  ["italy", "italian"], ["netherlands", "dutch", "holland"], ["norway", "norwegian"],
  ["poland", "polish"], ["portugal", "portuguese"], ["spain", "spanish"],
  ["sweden", "swedish"], ["switzerland", "swiss"], ["turkey", "turkish"],
  ["united kingdom", "britain", "british", "england", "scotland", "wales"],
] as const;

const GENERIC_QUERY_WORDS = new Set([
  "travel", "tourism", "photo", "photography", "view", "scene", "street", "city",
  "landscape", "people", "local", "detail", "food", "hotel", "train", "beautiful",
]);

function words(value: string) {
  return value.toLowerCase().match(/[a-z][a-z-]+/g) ?? [];
}

function countryGroups(value: string) {
  const normalized = value.toLowerCase();
  return COUNTRY_TERMS.flatMap((terms, index) => terms.some((term) => normalized.includes(term)) ? [index] : []);
}

/**
 * 图库可能按宽泛标签返回别国图片。明确搜了国家时，剔除标签里明确写着其他国家的结果；
 * 无法从标签判断地点的图片仍保留，再按关键词命中排序。
 *
 * 不再限制图片尺寸/比例：朋友圈九宫格由前端按显示比例自动裁切，
 * 之前按 0.75-1.33 过滤会让常见主题只剩个位数候选。
 */
export function reviewMediaPhotos(
  query: string,
  photos: MediaPhoto[],
  limit = 10,
) {
  const expectedCountries = new Set(countryGroups(query));
  const queryWords = [...new Set(words(query).filter((word) => word.length > 2 && !GENERIC_QUERY_WORDS.has(word)))];

  return photos
    .filter((photo) => {
      if (!expectedCountries.size) return true;
      const found = countryGroups(photo.alt);
      return !found.length || found.some((country) => expectedCountries.has(country));
    })
    .map((photo, index) => {
      const haystack = photo.alt.toLowerCase();
      const matches = queryWords.filter((word) => haystack.includes(word)).length;
      const countryMatch = countryGroups(photo.alt).some((country) => expectedCountries.has(country)) ? 1 : 0;
      return { photo, index, countryMatch, matches };
    })
    .sort((a, b) => b.countryMatch - a.countryMatch || b.matches - a.matches || a.index - b.index)
    .slice(0, limit)
    .map(({ photo }) => photo);
}
