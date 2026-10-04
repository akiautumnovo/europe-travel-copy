"use client";
import { useEffect } from "react";

/**
 * 应用内确认弹窗。
 *
 * 不要用原生 `confirm()`：在跨域 iframe（例如预览面板）里浏览器会静默拦截它，
 * 返回值恒为 false，表现为"点了删除没反应、也没有任何提示"。
 */
export default function ConfirmDialog({title,description,confirmLabel="确认删除",onConfirm,onCancel}:{title:string;description?:string;confirmLabel?:string;onConfirm:()=>void;onCancel:()=>void}){
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onCancel()};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[onCancel]);
  return <div className="confirm-backdrop" onClick={onCancel}>
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event=>event.stopPropagation()}>
      <h2>{title}</h2>
      {description&&<p>{description}</p>}
      <div className="confirm-actions">
        <button className="secondary-button" onClick={onCancel} autoFocus>取消</button>
        <button className="primary-button danger-solid" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
