"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { tokenStore } from "@/lib/api";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/book-scan", label: "Scan Barcode ISBN" },
  { href: "/ocr", label: "OCR" },
  { href: "/bookshelf", label: "Bookshelf" },
  { href: "/config", label: "Config" }
];

export default function HamburgerNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(Boolean(tokenStore.getSession()));
  }, []);

  if (!isAuthed || pathname === "/login") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <span className="flex flex-col gap-1">
          <span className="block h-0.5 w-4 rounded-full bg-neutral-800" />
          <span className="block h-0.5 w-4 rounded-full bg-neutral-800" />
          <span className="block h-0.5 w-4 rounded-full bg-neutral-800" />
        </span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-white p-5 shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Menu</h2>
            <button
              className="text-xs text-neutral-500"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              Close
            </button>
          </div>
          <div className="mt-4">
            <nav className="space-y-2 text-sm">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-xl px-3 py-2 ${
                    pathname === link.href ? "bg-neutral-100 text-neutral-900" : "text-neutral-600"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="border-t border-neutral-200 pt-4">
            <button
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-left text-xs text-neutral-600"
              onClick={() => {
                tokenStore.clear();
                setOpen(false);
                router.push("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
