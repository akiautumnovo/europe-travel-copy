/**
 * 朋友圈图片显示规则。
 *
 * 微信朋友圈会按图片数量决定排版，并把每格裁成固定比例（单图约 4:3，多图 1:1）：
 * 所以配图不需要提前裁好——只要按这里的规则在预览里等比放大填充 + 居中裁切，
 * 看到的就是发布后的效果。本模块同时给出「上传顺序」建议。
 */
export type MomentsLayout = {
  /** 微信的列数 */
  columns: 1 | 2 | 3;
  /** 单格显示比例（CSS aspect-ratio） */
  ratio: "4 / 3" | "1 / 1";
  /** 展示形态，例如「九宫格（3 列）」 */
  display: string;
  /** 裁切说明 */
  crop: string;
  /** 上传顺序建议 */
  order: string;
  /** 最抢眼的位置提示（没有则为空） */
  highlight: string;
};

export function momentsLayout(count: number): MomentsLayout {
  const safe = Math.max(0, Math.min(9, Math.floor(count || 0)));
  if (safe <= 1) {
    return {
      columns: 1,
      ratio: "4 / 3",
      display: "单张大图",
      crop: "会自动等比放大填满并居中裁切；竖长图上下裁得较多，横长图左右裁得较多。",
      order: "只发 1 张时微信给的展示面积最大，优先放最有冲击力、主体居中的横构图。",
      highlight: "",
    };
  }
  if (safe === 2) {
    return {
      columns: 2,
      ratio: "1 / 1",
      display: "两列一行",
      crop: "每张按 1:1 居中裁切，横竖图都不会被压变形。",
      order: "第 1 张在左、第 2 张在右；两张构图风格接近会更整齐。",
      highlight: "",
    };
  }
  if (safe === 3) {
    return {
      columns: 3,
      ratio: "1 / 1",
      display: "三列一行",
      crop: "每张按 1:1 居中裁切。",
      order: "从左到右是第 1-3 张；三张色调接近，整排看起来最舒服。",
      highlight: "",
    };
  }
  if (safe === 4) {
    return {
      columns: 2,
      ratio: "1 / 1",
      display: "两行两列",
      crop: "每张按 1:1 居中裁切。",
      order: "顺序是 第 1 张左上、第 2 张右上、第 3 张左下、第 4 张右下。",
      highlight: "",
    };
  }
  return {
    columns: 3,
    ratio: "1 / 1",
    display: `九宫格（3 列，共 ${safe} 张）`,
    crop: "每张按 1:1 居中裁切，主体尽量放在画面中央，避免裁掉关键部分。",
    order: "微信从左到右、从上到下排列，和这里的编号一致，按 1→" + safe + " 顺序上传即可。",
    highlight: safe >= 5 ? "第 1 张在左上角、第 5 张在正中，这两格最抢眼，建议放最好的图。" : "",
  };
}
