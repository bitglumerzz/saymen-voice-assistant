"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Дашборд", match: (p: string) => p === "/" },
  { href: "/calls", label: "Звонки", match: (p: string) => p.startsWith("/calls") },
  { href: "/campaigns", label: "Кампании", match: (p: string) => p.startsWith("/campaigns") },
  { href: "/contacts", label: "Контакты", match: (p: string) => p.startsWith("/contacts") },
  { href: "/stop-list", label: "Стоп-лист", match: (p: string) => p.startsWith("/stop-list") },
];

const DEV_ITEMS = [
  { href: "/dev/voice-test", label: "🎙 Микрофон" },
  { href: "/dev/test-call", label: "📞 Тестовый звонок" },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="text-xl text-blue-700">⬢</span>
          <span>Saymen</span>
        </Link>

        <ul className="flex flex-1 items-center gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "rounded-md px-3 py-1.5 transition " +
                    (active
                      ? "bg-blue-100 font-semibold text-blue-800"
                      : "text-slate-700 hover:bg-slate-100")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <ul className="flex items-center gap-1 text-xs">
          {DEV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
