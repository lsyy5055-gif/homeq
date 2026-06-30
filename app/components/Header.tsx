"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { name: "HomeQ", href: "/" },
  { name: "Sentira Air", href: "/sentira-air" },
  { name: "Sentira Scan", href: "/sentira-scan", disabled: true },
  { name: "Sentira Sensor", href: "/sentira-sensor", disabled: true },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-3xl font-black tracking-tight text-slate-950">
          Home<span className="text-blue-600">Q</span>
        </Link>

        <nav className="flex items-center gap-3">
          {menus.map((menu) => {
            const active = pathname === menu.href;

            if (menu.disabled) {
              return (
                <span
                  key={menu.name}
                  className="rounded-full px-4 py-2 text-base font-bold text-slate-400"
                >
                  {menu.name}
                </span>
              );
            }

            return (
              <Link
                key={menu.name}
                href={menu.href}
                className={
                  active
                    ? "rounded-full bg-slate-950 px-5 py-2 text-base font-black text-white"
                    : "rounded-full px-5 py-2 text-base font-bold text-slate-700 hover:bg-slate-100"
                }
              >
                {menu.name}
              </Link>
            );
          })}

          <button className="ml-2 rounded-full border border-slate-300 px-5 py-2 text-base font-bold text-slate-900 hover:bg-slate-100">
            로그인
          </button>
        </nav>
      </div>
    </header>
  );
}