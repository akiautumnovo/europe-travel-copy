"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, FolderInput, FolderOpen, FolderPlus, ImagePlus, Link2, Pencil, Trash2, Upload } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import { readApiError } from "@/lib/friendly-error";
import {
  folderChildren,
  folderPath,
  folderSubtreeIds,
  subtreeStats,
  type AssetFolder,
} from "@/lib/asset-folders";

type Asset = {
  id: string;
  assetType: string;
  sourceName: string;
  imageUrl: string;
  sourceUrl?: string;
  author?: string;
  licenseStatus: string;
  riskLevel: "green" | "yellow" | "red";
  folderId: string | null;
  metadata: Record<string, unknown>;
  usedBy: string[];
};

type Dialog =
  | { kind: "newFolder" }
  | { kind: "renameFolder"; folder: AssetFolder }
  | { kind: "moveFolder"; folder: AssetFolder }
  | { kind: "moveAsset"; asset: Asset }
  | { kind: "deleteFolder"; folder: AssetFolder }
  | { kind: "deleteAsset"; asset: Asset };

/** 把文件夹按层级展开成下拉选项（用全角空格缩进，中文界面里最直观）。 */
function folderOptions(folders: AssetFolder[], excludeIds: string[] = []) {
  const options: Array<{ id: string; label: string }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of folderChildren(folders, parentId)) {
      if (excludeIds.includes(folder.id)) continue;
      options.push({ id: folder.id, label: `${"　".repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
}

/** 接口异常时 usedBy 可能缺失，统一兜底避免整个页面崩掉。 */
const usedBy = (asset: Asset): string[] => (Array.isArray(asset.usedBy) ? asset.usedBy : []);

/** 卡片上的名字去掉扩展名，长名交给 CSS 单行截断，完整名放 title 悬停可见。 */
const displayName = (name: string): string => name.replace(/\.[a-z0-9]{2,5}$/i, "");

export default function AssetLibrary({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [license, setLicense] = useState("owned");
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [link, setLink] = useState({ imageUrl: "", sourceUrl: "", note: "" });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [folderName, setFolderName] = useState("");
  const [pickerValue, setPickerValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [assetsRes, foldersRes] = await Promise.all([fetch("/api/assets"), fetch("/api/assets/folders")]);
      if (!assetsRes.ok) {
        setItems([]);
        setFolders([]);
        setLoadError(await readApiError(assetsRes, "素材读取失败，请稍后重试。"));
        return;
      }
      const nextAssets = (await assetsRes.json()) as Asset[];
      const nextFolders = foldersRes.ok ? ((await foldersRes.json()) as AssetFolder[]) : [];
      setItems(nextAssets);
      setFolders(nextFolders);
      // 当前所在文件夹可能已被删除，退回顶层，避免停在空白页
      setCurrentFolder((current) => (current && nextFolders.some((f) => f.id === current) ? current : null));
      setLoadError("");
    } catch {
      setItems([]);
      setFolders([]);
      setLoadError("素材读取失败，请稍后重试。");
    }
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  const path = folderPath(folders, currentFolder);
  const childFolders = folderChildren(folders, currentFolder);
  const currentAssets = items.filter((asset) => (asset.folderId ?? null) === currentFolder);
  const targetLabel = path.length ? path.map((folder) => folder.name).join(" / ") : "未分类";

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.set("licenseType", license);
      if (currentFolder) form.set("folderId", currentFolder);
      const r = await fetch("/api/assets/batch", { method: "POST", body: form });
      const data = (await r.json()) as { error?: string; items?: Array<{ duplicate: boolean }>; failed?: Array<{ sourceName: string }> };
      if (!r.ok) {
        notify(data.error || "上传失败");
        return;
      }
      const duplicated = data.items?.some((x) => x.duplicate);
      const skipped = data.failed?.length || 0;
      notify(
        [duplicated ? "已上传，重复图片已自动跳过" : `已上传到「${targetLabel}」`, skipped ? `${skipped} 张未能保存` : ""]
          .filter(Boolean)
          .join("；"),
      );
      setFiles([]);
      await load();
    } catch {
      notify("上传失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    try {
      const body = currentFolder ? { ...link, folderId: currentFolder } : link;
      const r = await fetch("/api/assets/external", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await r.json()) as { error?: string };
      if (r.ok) {
        setLink({ imageUrl: "", sourceUrl: "", note: "" });
        setShowLink(false);
        await load();
        notify("外部图片链接已保存");
      } else notify(data.error || "保存失败");
    } catch {
      notify("保存失败，请重试");
    }
  }

  async function risk(id: string, riskLevel: Asset["riskLevel"]) {
    try {
      const r = await fetch(`/api/assets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ riskLevel }) });
      if (!r.ok) {
        notify(await readApiError(r, "风险等级更新失败"));
        return;
      }
      await load();
    } catch {
      notify("风险等级更新失败");
    }
  }

  /** 移动素材（folderId 传 null 表示移回未分类）。 */
  async function moveAsset(assetId: string, folderId: string | null) {
    try {
      const r = await fetch(`/api/assets/${assetId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId }) });
      if (!r.ok) {
        notify(await readApiError(r, "移动失败"));
        return;
      }
      await load();
      notify("已移动");
    } catch {
      notify("移动失败，请重试");
    }
  }

  async function deleteAsset(assetId: string) {
    try {
      const r = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
      if (!r.ok) {
        notify(await readApiError(r, "删除失败"));
        return;
      }
      await load();
      notify("素材已删除");
    } catch {
      notify("删除失败，请重试");
    }
  }

  async function createFolder() {
    try {
      const r = await fetch("/api/assets/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: folderName, parentId: currentFolder }),
      });
      if (!r.ok) {
        notify(await readApiError(r, "新建文件夹失败"));
        return;
      }
      setDialog(null);
      await load();
      notify(`已在「${targetLabel}」下新建文件夹`);
    } catch {
      notify("新建文件夹失败，请重试");
    }
  }

  async function renameFolder(folder: AssetFolder) {
    try {
      const r = await fetch(`/api/assets/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
      if (!r.ok) {
        notify(await readApiError(r, "重命名失败"));
        return;
      }
      setDialog(null);
      await load();
      notify("文件夹已重命名");
    } catch {
      notify("重命名失败，请重试");
    }
  }

  async function moveFolder(folder: AssetFolder, parentId: string | null) {
    try {
      const r = await fetch(`/api/assets/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      if (!r.ok) {
        notify(await readApiError(r, "移动失败"));
        return;
      }
      setDialog(null);
      await load();
      notify("文件夹已移动");
    } catch {
      notify("移动失败，请重试");
    }
  }

  async function deleteFolder(folder: AssetFolder, recursive: boolean) {
    try {
      const r = await fetch(`/api/assets/folders/${folder.id}${recursive ? "?recursive=1" : ""}`, { method: "DELETE" });
      const data = (await r.json().catch(() => ({}))) as { error?: string; movedAssets?: number };
      if (!r.ok) {
        notify(data.error || (await readApiError(r, "删除失败")));
        return;
      }
      setDialog(null);
      // 删掉的正是当前所在文件夹时退回顶层
      setCurrentFolder((current) => (current === folder.id ? null : current));
      await load();
      notify(data.movedAssets ? `文件夹已删除，${data.movedAssets} 张图片移到了「未分类」` : "文件夹已删除");
    } catch {
      notify("删除失败，请重试");
    }
  }

  const openDialog = (next: Dialog, name = "") => {
    setFolderName(name);
    setPickerValue("");
    setDialog(next);
  };

  function dialogBody() {
    if (!dialog) return null;
    if (dialog.kind === "newFolder") {
      return {
        title: `在「${targetLabel}」下新建文件夹`,
        description: "建好后可以再进去继续建子文件夹，最多 6 层。",
        field: (
          <div className="dialog-field">
            <label htmlFor="folder-name">文件夹名称</label>
            <input id="folder-name" value={folderName} autoFocus maxLength={40} onChange={(e) => setFolderName(e.target.value)} placeholder="例如：西班牙 / 12月出团" />
          </div>
        ),
        confirmLabel: "创建",
        confirm: createFolder,
      };
    }
    if (dialog.kind === "renameFolder") {
      return {
        title: `重命名「${dialog.folder.name}」`,
        description: undefined,
        field: (
          <div className="dialog-field">
            <label htmlFor="folder-name">文件夹名称</label>
            <input id="folder-name" value={folderName} autoFocus maxLength={40} onChange={(e) => setFolderName(e.target.value)} />
          </div>
        ),
        confirmLabel: "保存",
        confirm: () => renameFolder(dialog.folder),
      };
    }
    if (dialog.kind === "moveFolder" || dialog.kind === "moveAsset") {
      const isFolder = dialog.kind === "moveFolder";
      const folder = isFolder ? dialog.folder : null;
      const exclude = folder ? folderSubtreeIds(folders, folder.id) : [];
      const options = folderOptions(folders, exclude);
      const confirm = () => {
        const target = pickerValue || null;
        if (isFolder) void moveFolder(folder!, target);
        else void moveAsset(dialog.asset.id, target);
      };
      return {
        title: isFolder ? `移动「${folder!.name}」` : `移动「${dialog.asset.sourceName}」`,
        description: isFolder ? "不能移动到它自己或它的子文件夹里。" : undefined,
        field: (
          <div className="dialog-field">
            <label htmlFor="move-target">移动到</label>
            <select id="move-target" value={pickerValue} onChange={(e) => setPickerValue(e.target.value)}>
              <option value="">未分类（顶层）</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ),
        confirmLabel: "移动",
        confirm,
      };
    }
    return null;
  }

  const folderDialog = dialog?.kind === "deleteFolder" ? dialog.folder : null;
  const stats = folderDialog ? subtreeStats(folders, items.map((asset) => asset.folderId ?? ""), folderDialog.id) : null;
  const assetDialog = dialog?.kind === "deleteAsset" ? dialog.asset : null;
  const body = dialogBody();

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="kicker">真实图片素材</p>
          <h1>为下一条内容找画面</h1>
        </div>
        <div className="asset-top-actions">
          <button className="secondary-button" onClick={() => openDialog({ kind: "newFolder" })}>
            <FolderPlus size={17} />新建文件夹
          </button>
          <button className="secondary-button" onClick={() => setShowLink((v) => !v)}>
            <Link2 size={17} />外部链接
          </button>
          <button className="primary-button" onClick={() => input.current?.click()}>
            <Upload size={17} />选择图片
          </button>
        </div>
      </header>
      <input ref={input} hidden multiple type="file" accept="image/*" onChange={(e) => setFiles([...(e.target.files || [])])} />

      <nav className="asset-breadcrumb" aria-label="素材位置">
        <button className={currentFolder ? "" : "current"} onClick={() => setCurrentFolder(null)}>全部素材</button>
        {path.map((folder, index) => (
          <span key={folder.id}>
            <ChevronRight size={14} />
            <button className={index === path.length - 1 ? "current" : ""} onClick={() => setCurrentFolder(folder.id)}>{folder.name}</button>
          </span>
        ))}
        <small>{currentAssets.length} 张图片{childFolders.length ? ` · ${childFolders.length} 个子文件夹` : ""} · 素材库共 {items.length} 张</small>
      </nav>

      {files.length > 0 && (
        <section className="batch-upload">
          <div>
            <strong>已选择 {files.length} 张图片</strong>
            <p>将上传到「{targetLabel}」，同一批图片使用统一授权状态</p>
          </div>
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            <option value="owned">本人/公司拍摄</option>
            <option value="authorized">已获得授权</option>
            <option value="purchased">商业购买素材</option>
            <option value="other">其他</option>
          </select>
          <button className="primary-button" disabled={busy} onClick={upload}>{busy ? "上传中…" : "确认上传"}</button>
        </section>
      )}

      {showLink && (
        <section className="external-form">
          <input placeholder="图片 URL" value={link.imageUrl} onChange={(e) => setLink({ ...link, imageUrl: e.target.value })} />
          <input placeholder="来源页面" value={link.sourceUrl} onChange={(e) => setLink({ ...link, sourceUrl: e.target.value })} />
          <input placeholder="备注" value={link.note} onChange={(e) => setLink({ ...link, note: e.target.value })} />
          <button className="primary-button" onClick={addLink}>保存链接</button>
        </section>
      )}

      {childFolders.length > 0 && (
        <div className="folder-grid">
          {childFolders.map((folder) => {
            const direct = {
              folders: folders.filter((item) => item.parentId === folder.id).length,
              assets: items.filter((asset) => asset.folderId === folder.id).length,
            };
            return (
              <article className="folder-card" key={folder.id}>
                <button className="folder-open" onClick={() => setCurrentFolder(folder.id)}>
                  <FolderOpen size={20} />
                  <span>
                    <strong>{folder.name}</strong>
                    <small>{direct.assets ? `${direct.assets} 张图片` : "没有图片"}{direct.folders ? ` · ${direct.folders} 个子文件夹` : ""}</small>
                  </span>
                </button>
                <div className="folder-card-actions">
                  <button title="重命名" aria-label={`重命名 ${folder.name}`} onClick={() => openDialog({ kind: "renameFolder", folder }, folder.name)}><Pencil size={15} /></button>
                  <button title="移动到其他文件夹" aria-label={`移动 ${folder.name}`} onClick={() => openDialog({ kind: "moveFolder", folder })}><FolderInput size={15} /></button>
                  <button title="删除文件夹" aria-label={`删除 ${folder.name}`} onClick={() => openDialog({ kind: "deleteFolder", folder })}><Trash2 size={15} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {currentAssets.length > 0 ? (
        <div className="real-asset-grid">
          {currentAssets.map((asset) => (
            <article className="real-asset-card" key={asset.id}>
              <div className="asset-photo">
                {asset.imageUrl ? <img src={asset.imageUrl} alt={asset.sourceName} /> : <ImagePlus />}
                <span className={`risk-dot ${asset.riskLevel}`}>{asset.riskLevel === "green" ? "绿色" : asset.riskLevel === "yellow" ? "黄色" : "红色"}</span>
              </div>
              <div className="real-asset-info">
                <strong title={asset.sourceName}>{displayName(asset.sourceName)}</strong>
                <small>
                  {asset.assetType === "pixabay"
                    ? `Image by ${asset.author} on Pixabay`
                    : asset.assetType === "pexels"
                      ? `Photo by ${asset.author} on Pexels`
                      : asset.assetType === "external_link"
                        ? "外部链接"
                        : "本人素材"}
                </small>
                {asset.sourceUrl && (
                  <a href={asset.sourceUrl} target="_blank" rel="noreferrer">查看来源 <ExternalLink size={13} /></a>
                )}
                {usedBy(asset).length > 0 && <small className="asset-used" title={usedBy(asset).join("、")}>已用于「{usedBy(asset)[0]}」{usedBy(asset).length > 1 ? ` 等 ${usedBy(asset).length} 条内容` : ""}</small>}
                <select value={asset.riskLevel} onChange={(e) => risk(asset.id, e.target.value as Asset["riskLevel"])}>
                  <option value="green">绿色风险</option>
                  <option value="yellow">黄色风险</option>
                  <option value="red">红色风险</option>
                </select>
                <div className="asset-card-actions">
                  <button className="mini-button" onClick={() => openDialog({ kind: "moveAsset", asset })}><FolderInput size={15} />移动</button>
                  <button className="mini-button danger" onClick={() => openDialog({ kind: "deleteAsset", asset })}><Trash2 size={15} />删除</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !loadError &&
        childFolders.length === 0 && (
          <div className="empty-hint">
            <ImagePlus />
            <div>
              <strong>{currentFolder ? "这个文件夹还是空的" : "还没有图片素材"}</strong>
              <p>上传自己的照片，或添加有明确来源的图片链接。也可以用「新建文件夹」先分好类。</p>
            </div>
          </div>
        )
      )}

      {loadError && <p className="analysis-error" role="alert">{loadError}</p>}

      {body && (
        <div className="confirm-backdrop" onClick={() => setDialog(null)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={body.title} onClick={(e) => e.stopPropagation()}>
            <h2>{body.title}</h2>
            {body.description && <p>{body.description}</p>}
            {body.field}
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setDialog(null)}>取消</button>
              <button className="primary-button" onClick={body.confirm}>{body.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}

      {folderDialog && (
        <ConfirmDialog
          title={`删除「${folderDialog.name}」？`}
          description={
            stats && (stats.assets || stats.folders)
              ? `里面还有 ${stats.assets} 张图片${stats.folders ? `和 ${stats.folders} 个子文件夹` : ""}。${stats.folders ? "子文件夹会一起删除，" : ""}图片会移到「未分类」保留，不会被删掉。`
              : "这是个空文件夹，删除后无法恢复。"
          }
          confirmLabel="删除文件夹"
          onConfirm={() => void deleteFolder(folderDialog, Boolean(stats && (stats.assets || stats.folders)))}
          onCancel={() => setDialog(null)}
        />
      )}

      {assetDialog && (
        <ConfirmDialog
          title={`删除「${assetDialog.sourceName}」？`}
          description={
            usedBy(assetDialog).length
              ? `这条素材已经用在「${usedBy(assetDialog).join("、")}」里，删除后那些内容的故事板会缺这一张。`
              : "删除后无法恢复，文件也会一并从存储中移除。"
          }
          onConfirm={() => {
            const target = assetDialog;
            setDialog(null);
            void deleteAsset(target.id);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      <p className="rights-notice">绿色表示平台或授权条件层面可用，但不代表图片中的人物、商标、艺术品或场地等第三方权利一定不存在。</p>
    </div>
  );
}
