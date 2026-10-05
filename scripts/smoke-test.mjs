/**
 * 端到端验证脚本（本地和线上都能跑）。
 *
 * 覆盖：邮箱门禁 → 建产品 → AI 解析 → 批量确认事实 → 产品灵感 → 单篇生成 → 版本详情 →
 *       改稿 → 采用 → 故事板 → 图库搜索 → 事实核验 → 灵感刷新 →
 *       素材上传/读回/去重 → 风险标记 → 删除内容/产品。
 *
 * 用法：
 *   本地  node scripts/smoke-test.mjs
 *   线上  BASE_URL=https://travel-copy-assistant.app.workbuddy.host node scripts/smoke-test.mjs
 *
 * 注意：会在目标环境创建产品/内容/素材，结束时删除产品与内容；
 * 素材没有删除接口（产品设计如此），会留下一条 66 字节的测试图。
 * 测试邮箱默认取白名单里的第一个，可用 TEST_EMAIL 覆盖。
 */
const B = process.env.BASE_URL || "http://localhost:5180";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(B);
const H = (cookie) => ({ cookie, "content-type": "application/json" });

const line = (label, value) => console.log(`  ${String(label).padEnd(22)} ${value}`);
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${String(label).padEnd(26)} ${detail}`);
};

// 登录
const gate = await fetch(`${B}/api/access`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.TEST_EMAIL || "akiautumnovo@gmail.com" }),
});
const cookie = (gate.headers.getSetCookie?.() ?? [gate.headers.get("set-cookie")])
  .map((x) => x.split(";")[0])
  .join("; ");
const api = async (url, init = {}) => {
  const r = await fetch(B + url, { ...init, headers: { ...H(cookie), ...(init.headers || {}) } });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
};
const bootstrapped = await api("/api/bootstrap", { method: "POST" });
check("初始化用户数据", bootstrapped.status === 200, `HTTP ${bootstrapped.status}`);

console.log("=== 1. 建产品 + AI 解析 ===");
const created = await api("/api/products", {
  method: "POST",
  body: JSON.stringify({ name: `E2E测试产品-${Date.now()}`, status: "focus" }),
});
check("创建产品", created.status === 201, `id=${created.data.id?.slice(0, 8)}`);
const productId = created.data.id;

const rawText = "瑞士8日7晚小团，11月8日出发，¥15,800/人，全程四星酒店，含少女峰往返火车票，仅剩6个名额。";
const analysis = await api("/api/analysis", { method: "POST", body: JSON.stringify({ type: "official_product", text: rawText }) });
const facts = analysis.data.analysis?.hard_facts ?? [];
check("AI 解析", analysis.status === 200 && facts.length > 0, `${facts.length} 条硬事实`);
check("千分位价格识别", facts.some((f) => String(f.value).includes("15,800") || String(f.value).includes("15800")), facts.find((f) => /15,?800/.test(String(f.value)))?.value ?? "未识别");

console.log("=== 2. 事实保存（走 batch 事务）===");
const confirmed = await api(`/api/products/${productId}/confirm-analysis`, {
  method: "POST",
  body: JSON.stringify({ type: "official_product", rawText, analysis: { ...analysis.data.analysis, hard_facts: facts.map((f) => ({ ...f, status: "confirmed" })) } }),
});
check("锁定事实", confirmed.status === 200, `lockedFacts=${confirmed.data.lockedFacts?.length}`);
check("产品列表读回事实数", (await api("/api/products")).data.find((p) => p.id === productId)?.lockedFactCount > 0);

console.log("=== 3. 产品灵感 + 单篇生成 ===");
const inspiration = await api(`/api/inspiration/today?productId=${productId}`);
const angleTypes = inspiration.data.topics?.map((topic) => topic.angleType).sort() ?? [];
check("四类产品灵感", inspiration.status === 200 && angleTypes.join(",") === "culture,current,history,resources", angleTypes.join(" / "));
check("灵感绑定当前产品", inspiration.data.topics?.every((topic) => topic.productId === productId), `${inspiration.data.topics?.length || 0} 条`);
const selectedInspiration = inspiration.data.topics?.find((topic) => topic.angleType !== "current") || inspiration.data.topics?.[0];
const generation = await api("/api/generation/copy", {
  method: "POST",
  body: JSON.stringify({ productId, inspirationId: selectedInspiration?.id }),
});
check("生成单篇文案", generation.status === 201, generation.status === 201 ? `V${generation.data.versionNo}` : JSON.stringify(generation.data).slice(0, 160));
const contentId = generation.data.contentId;
check("仅保存一个初始版本", generation.data.versionNo === 1 && Array.isArray(generation.data.draft?.blocks), `versionNo=${generation.data.versionNo}`);

console.log("=== 4. 详情 + 版本列表（all().results 路径）===");
const detail = await api(`/api/contents/${contentId}`);
check("读取内容详情", detail.status === 200, `versions=${detail.data.versions?.length}`);
// 详情接口把 blocks / lockedBlockIds 原样返回（JSON 字符串），前端也是自己 JSON.parse 的
const latestVersion = detail.data.versions?.at(-1);
const baseBlocks = JSON.parse(latestVersion?.blocks ?? "[]");
check("版本里的段落可解析", Array.isArray(baseBlocks) && baseBlocks.length > 0, `${baseBlocks.length} 段`);

console.log("=== 5. 改稿 + 采用 ===");
const revise = await api(`/api/contents/${contentId}/revise`, {
  method: "POST",
  body: JSON.stringify({ versionNo: generation.data.versionNo, blocks: baseBlocks, lockedBlockIds: [], instruction: "保持完整结构，把表达改得更自然一些" }),
});
check("快捷改稿", revise.status === 200, revise.status === 200 ? `V${revise.data.versionNo}` : JSON.stringify(revise.data).slice(0, 160));
const adopt = await api(`/api/contents/${contentId}/adopt`, {
  method: "POST",
  body: JSON.stringify({ versionNo: revise.data?.versionNo || generation.data.versionNo, blocks: revise.data?.blocks ?? baseBlocks, lockedBlockIds: [] }),
});
check("采用此版", adopt.status === 200, adopt.status === 200 ? `styleLearned=${adopt.data.styleLearned}` : JSON.stringify(adopt.data).slice(0, 160));

console.log("=== 6. 故事板 + 图库 + 事实核验 ===");
const storyboard = await api(`/api/contents/${contentId}/storyboard`, { method: "POST", body: JSON.stringify({ blocks: (revise.data?.blocks || baseBlocks).slice(0, 3) }) });
check("生成故事板", storyboard.status === 200, storyboard.status === 200 ? `${storyboard.data.roles?.length} 角色` : JSON.stringify(storyboard.data).slice(0, 160));
const media = await api("/api/media/search", { method: "POST", body: JSON.stringify({ query: "interlaken switzerland" }) });
check("图库搜索", media.status === 200 && media.data.photos?.length > 0, `${media.data.photos?.length} 张 / by ${media.data.photos?.[0]?.photographer}`);
const verify = await api("/api/facts/verify", { method: "POST", body: JSON.stringify({ claim: "SBB 瑞士铁路 2026 时刻表调整" }) });
check("事实核验（走搜索链路）", verify.status === 200, `来源 ${verify.data.sources?.length} 条 / ${verify.data.status}`);

console.log("=== 7. 灵感刷新 ===");
const refresh = await api("/api/inspiration/refresh", { method: "POST", body: JSON.stringify({ productId }) });
check("换一组产品灵感", refresh.status === 200 && refresh.data.topics?.length === 4, refresh.data.topics?.map((t) => t.contentType).join(" / "));

console.log("=== 8. 素材上传 / 读回 / 去重（本地文件存储）===");
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
const upload = async (name) => {
  const form = new FormData();
  form.append("files", new Blob([png], { type: "image/png" }), name);
  form.append("licenseType", "owned");
  const r = await fetch(`${B}/api/assets/batch`, { method: "POST", headers: { cookie }, body: form });
  return { status: r.status, data: await r.json() };
};
const first = await upload("e2e-pixel.png");
check("上传素材", first.status === 201 && first.data.items?.length === 1, `duplicate=${first.data.items?.[0]?.duplicate}`);
const assetId = first.data.items?.[0]?.id;
const again = await upload("e2e-pixel.png");
check("重复上传被识别", again.data.items?.[0]?.duplicate === true);
const fileRes = await fetch(`${B}/api/assets/${assetId}/file`, { headers: { cookie } });
const bytes = new Uint8Array(await fileRes.arrayBuffer());
check("读回素材文件", fileRes.status === 200 && bytes.length === png.length, `${bytes.length} 字节 / ${fileRes.headers.get("content-type")}`);
const listed = await api("/api/assets");
check("素材列表带可访问地址", listed.data.some((a) => a.id === assetId), `${listed.data.length} 条`);

// 配图保存与读回：创作页的「配图条」和「朋友圈预览」都依赖这条数据。
// 之前保存了却从来不读回来，表现就是"选了素材但看不到、用不上"。
// 再补一张素材（单文件上传接口不做去重），用来验证顺序是原样保留的。
const singleForm = new FormData();
singleForm.append("file", new Blob([png], { type: "image/png" }), "e2e-pixel-2.png");
singleForm.append("kind", "asset");
const singleUpload = await fetch(`${B}/api/assets`, { method: "POST", headers: { cookie }, body: singleForm });
const secondAssetId = (await singleUpload.json()).id;
check("单文件上传接口可用", singleUpload.status === 201 && Boolean(secondAssetId));

const storyboardSave = await api(`/api/contents/${contentId}/assets`, {
  method: "PUT",
  body: JSON.stringify({ targetCount: 3, items: [{ assetId: secondAssetId }, { assetId }], confirmRed: false }),
});
check("保存配图选择", storyboardSave.status === 200, `HTTP ${storyboardSave.status}`);
const contentDetail = await api(`/api/contents/${contentId}`);
const savedItems = contentDetail.data.content?.topicMeta?.assetSelection?.items ?? [];
check(
  "配图顺序原样读回",
  savedItems[0]?.assetId === secondAssetId && savedItems[1]?.assetId === assetId,
  savedItems.map((item) => item.assetId?.slice(0, 6)).join(" → "),
);
check("配图图片地址可访问", (await fetch(`${B}/api/assets/${assetId}/file`, { headers: { cookie } })).status === 200);

console.log("=== 9. 风险标记 + 删除路径（batch + 级联）===");
check("调整素材风险等级（PATCH）", (await api(`/api/assets/${assetId}`, { method: "PATCH", body: JSON.stringify({ riskLevel: "yellow" }) })).status === 200);
const del = await api(`/api/contents/${contentId}`, { method: "DELETE" });
check("删除内容", del.status === 200, `剩余 ${(await api("/api/contents")).data.length} 条`);
check("删除产品", (await api(`/api/products/${productId}`, { method: "DELETE" })).status === 200);
check("删除素材", (await api(`/api/assets/${assetId}`, { method: "DELETE" })).status === 200);
check("删除第二张素材", (await api(`/api/assets/${secondAssetId}`, { method: "DELETE" })).status === 200);
check("素材文件随之清掉", (await fetch(`${B}/api/assets/${assetId}/file`, { headers: { cookie } })).status === 404);

console.log("=== 10. 素材文件夹（新建 / 嵌套 / 移动 / 改名 / 删除）===");
const suffix = Date.now().toString().slice(-5);
const folderA = await api("/api/assets/folders", { method: "POST", body: JSON.stringify({ name: `测试A-${suffix}` }) });
check("新建顶层文件夹", folderA.status === 201, folderA.data.id?.slice(0, 8));
const folderA1 = await api("/api/assets/folders", { method: "POST", body: JSON.stringify({ name: "子层", parentId: folderA.data.id }) });
check("在文件夹里继续建子文件夹", folderA1.status === 201);
const folderA1a = await api("/api/assets/folders", { method: "POST", body: JSON.stringify({ name: "孙层", parentId: folderA1.data.id }) });
check("继续嵌套到第三层", folderA1a.status === 201);
const duplicatedFolder = await api("/api/assets/folders", { method: "POST", body: JSON.stringify({ name: "子层", parentId: folderA.data.id }) });
check("同层重名被拒绝", duplicatedFolder.status === 409, duplicatedFolder.data.error);
const badMove = await api(`/api/assets/folders/${folderA.data.id}`, { method: "PATCH", body: JSON.stringify({ parentId: folderA1a.data.id }) });
check("禁止移动到自己的子文件夹", badMove.status === 400, badMove.data.error);
const renameFolder = await api(`/api/assets/folders/${folderA1.data.id}`, { method: "PATCH", body: JSON.stringify({ name: "子层改名" }) });
check("重命名文件夹", renameFolder.status === 200 && renameFolder.data.name === "子层改名");

const folderForm = new FormData();
folderForm.append("files", new Blob([png], { type: "image/png" }), "folder-pixel.png");
folderForm.append("licenseType", "owned");
folderForm.append("folderId", folderA1a.data.id);
const folderUpload = await fetch(`${B}/api/assets/batch`, { method: "POST", headers: { cookie }, body: folderForm });
const folderUploadData = await folderUpload.json();
check("上传到指定文件夹", folderUpload.status === 201, `duplicate=${folderUploadData.items?.[0]?.duplicate}`);
const folderAssetId = folderUploadData.items?.[0]?.id;
const withFolder = await api("/api/assets");
check("列表里带上 folderId", withFolder.data.find((a) => a.id === folderAssetId)?.folderId === folderA1a.data.id);
check("移动素材到别的文件夹", (await api(`/api/assets/${folderAssetId}`, { method: "PATCH", body: JSON.stringify({ folderId: folderA.data.id }) })).status === 200);
check("移动后再读确认", (await api("/api/assets")).data.find((a) => a.id === folderAssetId)?.folderId === folderA.data.id);

const refuseDelete = await api(`/api/assets/folders/${folderA.data.id}`, { method: "DELETE" });
check("非空文件夹删除需确认", refuseDelete.status === 409 && refuseDelete.data.code === "FOLDER_NOT_EMPTY", refuseDelete.data.error);
check("删除空文件夹", (await api(`/api/assets/folders/${folderA1a.data.id}`, { method: "DELETE" })).status === 200);
const forceDelete = await api(`/api/assets/folders/${folderA.data.id}?recursive=1`, { method: "DELETE" });
check("确认后删除整棵子树", forceDelete.status === 200, `删除 ${forceDelete.data.deletedFolders} 个文件夹，${forceDelete.data.movedAssets} 张图片回到未分类`);
check("里面的素材回到未分类", (await api("/api/assets")).data.find((a) => a.id === folderAssetId)?.folderId === null);
const foldersLeft = await api("/api/assets/folders");
check("测试文件夹已清理", foldersLeft.data.every((f) => f.id !== folderA.data.id && f.id !== folderA1.data.id));
check("清理测试素材", (await api(`/api/assets/${folderAssetId}`, { method: "DELETE" })).status === 200);

if (isLocal) {
  console.log("=== 11. 数据留痕（直接查本地 SQLite）===");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(".data/app.db");
  for (const table of ["profiles", "products", "contents", "content_versions", "style_dna", "assets", "asset_folders", "fact_cache"]) {
    line(table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  }
} else {
  console.log("=== 11. 数据留痕（远程目标，跳过本地库检查）===");
  line("产品剩余", (await api("/api/products")).data.length);
  line("内容剩余", (await api("/api/contents")).data.length);
  line("素材剩余", (await api("/api/assets")).data.length);
  line("文件夹剩余", (await api("/api/assets/folders")).data.length);
}

console.log(`\n${failures === 0 ? "全部通过 ✔" : `有 ${failures} 项失败 ✘`}`);
process.exit(failures === 0 ? 0 : 1);
