"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "매매", match: (p: string) => p === "/" || p.startsWith("/report") },
  { href: "/presale", label: "분양", match: (p: string) => p.startsWith("/presale") },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-20 bg-navy pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2">
        <Link href="/" className="text-base font-bold tracking-tight">
          부동산 분석
        </Link>
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${active ? "bg-accent text-white" : "text-slate-300 hover:bg-white/10"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
