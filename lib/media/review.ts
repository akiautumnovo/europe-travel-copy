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

function aspectScore(photo: MediaPhoto, orientation: "landscape" | "portrait" | "square") {
  const target = orientation === "landscape" ? 1.5 : orientation === "portrait" ? 0.8 : 1;
  const ratio = photo.width / Math.max(photo.height, 1);
  return Math.abs(Math.log(ratio / target));
}

function hasSuitableAspect(photo: MediaPhoto, orientation: "landscape" | "portrait" | "square") {
  const ratio = photo.width / Math.max(photo.height, 1);
  if (orientation === "landscape") return ratio >= 1.2;
  if (orientation === "portrait") return ratio <= 0.9;
  // 朋友圈九宫格按方形展示，限制过宽/过高图片，减少关键主体被裁掉的概率。
  return ratio >= 0.75 && ratio <= 1.33;
}

/**
 * 图库可能按宽泛标签返回别国图片。明确搜了国家时，剔除标签里明确写着其他国家的结果；
 * 无法从标签判断地点的图片仍保留，再按关键词命中和朋友圈常用比例排序。
 */
export function reviewMediaPhotos(
  query: string,
  photos: MediaPhoto[],
  orientation: "landscape" | "portrait" | "square" = "square",
  limit = 10,
) {
  const expectedCountries = new Set(countryGroups(query));
  const queryWords = [...new Set(words(query).filter((word) => word.length > 2 && !GENERIC_QUERY_WORDS.has(word)))];

  return photos
    .filter((photo) => {
      if (!hasSuitableAspect(photo, orientation)) return false;
      if (!expectedCountries.size) return true;
      const found = countryGroups(photo.alt);
      return !found.length || found.some((country) => expectedCountries.has(country));
    })
    .map((photo, index) => {
      const haystack = photo.alt.toLowerCase();
      const matches = queryWords.filter((word) => haystack.includes(word)).length;
      const countryMatch = countryGroups(photo.alt).some((country) => expectedCountries.has(country)) ? 1 : 0;
      return { photo, index, countryMatch, matches, aspect: aspectScore(photo, orientation) };
    })
    .sort((a, b) => b.countryMatch - a.countryMatch || b.matches - a.matches || a.aspect - b.aspect || a.index - b.index)
    .slice(0, limit)
    .map(({ photo }) => photo);
}
