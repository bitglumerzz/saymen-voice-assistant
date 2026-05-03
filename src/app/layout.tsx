import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saymen — голосовой ИИ-ассистент",
  description: "Админка для голосового ассистента: кампании, контакты, звонки, аналитика",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
