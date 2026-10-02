import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "旅笺｜欧洲旅行内容助手", description: "欧洲旅游销售朋友圈内容创作工作台", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
