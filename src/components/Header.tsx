"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Басты бет" },
  { href: "/habits", label: "Әдеттер" },
  { href: "/stats", label: "Статистика" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-indigo-600 text-white shadow">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <h1 className="text-xl font-bold">🌱 Habit Tracker</h1>
        <nav className="flex gap-5 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "font-semibold underline underline-offset-4"
                  : "opacity-80 hover:opacity-100"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}