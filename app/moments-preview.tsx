"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { momentsLayout } from "@/lib/moments-layout";

export type PreviewImage = { key: string; imageUrl: string; label: string };

/**
 * 朋友圈预览：把文案和配图按发布后的样子排在一起。
 *
 * 存在的意义有两层：
 *  1. 这是唯一能"整体看一遍"的地方——之前文案和配图分在两个面板里，得靠脑补；
 *  2. 图片可以点开原图（新窗口），这样素材才真的能拿去发布。
 */
export default function MomentsPreview({
  blocks,
  images,
  onClose,
  onCopy,
}: {
  blocks: Array<{ id: string; text: string }>;
  images: PreviewImage[];
  onClose: () => void;
  onCopy: () => void;
}) {
  const paragraphs = blocks.map((block) => block.text.trim()).filter(Boolean);
  // 微信朋友圈最多展示 9 张，多的只提示不展示
  const visible = images.slice(0, 9);
  // 默认按微信实际效果（等比放大填充 + 居中裁切）显示；可切换回原图完整比例，看清裁掉了什么。
  const [showOriginal, setShowOriginal] = useState(false);
  const layout = momentsLayout(visible.length);

  return (
    <div className="moments-backdrop" onClick={onClose}>
      <section className="moments-shell" role="dialog" aria-modal="true" aria-label="朋友圈预览" onClick={(e) => e.stopPropagation()}>
        <header className="moments-head">
          <div>
            <span className="mini-label">朋友圈预览</span>
            <h2>发布后大概是这个样子</h2>
          </div>
          <button className="moments-close" onClick={onClose} aria-label="关闭预览"><X size={20} /></button>
        </header>

        <div className="moments-stage">
          <article className="moments-post">
            <span className="moments-avatar">旅</span>
            <div className="moments-body">
              <strong className="moments-name">你的朋友圈</strong>
              <div className="moments-text">
                {paragraphs.length ? paragraphs.map((text, index) => <p key={index}>{text}</p>) : <p className="moments-empty">还没有文案</p>}
              </div>

              {visible.length > 0 ? (
                <>
                  <div className={`moments-images n${visible.length} ${showOriginal ? "view-original" : "view-cropped"}`}>
                    {visible.map((image, index) => (
                      <a key={image.key} href={image.imageUrl} target="_blank" rel="noreferrer" title={`第${index + 1}张：在新窗口打开原图，右键另存为即可发布`}>
                        <img src={image.imageUrl} alt={image.label || `第 ${index + 1} 张配图`} />
                        <span className="moments-index">{index + 1}</span>
                      </a>
                    ))}
                  </div>
                  <div className="moments-layout-note">
                    <div className="moments-layout-head">
                      <strong>微信会这样显示：{layout.display}</strong>
                      <button type="button" onClick={() => setShowOriginal((v) => !v)}>
                        {showOriginal ? "看微信裁切后" : "看原图完整比例"}
                      </button>
                    </div>
                    <p>裁切：{layout.crop}</p>
                    <p>顺序：{layout.order}</p>
                    {layout.highlight && <p>{layout.highlight}</p>}
                  </div>
                </>
              ) : (
                <p className="moments-noimage">这条还没有配图，点「配图」可以搜索图库或选择本人素材。</p>
              )}

              {images.length > 9 && <p className="moments-note">朋友圈一次最多展示 9 张，还有 {images.length - 9} 张不会显示。</p>}
            </div>
          </article>
        </div>

        <p className="moments-tip">
          {visible.length > 0
            ? "点击任意配图会在新窗口打开原图，右键另存为就能直接拿去发朋友圈。顺序就是你在「配图」里排的顺序。"
            : "先用「配图」挑好图片，这里就会按发布顺序显示出来。"}
        </p>

        <div className="moments-actions">
          <button className="secondary-button" onClick={onCopy}>复制文案</button>
          <button className="primary-button" onClick={onClose}>知道了</button>
        </div>
      </section>
    </div>
  );
}
