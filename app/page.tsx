"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tokenStore } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(Boolean(tokenStore.getSession()));
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-6 py-10">
      <div className="mx-auto flex max-w-screen-md flex-col gap-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Book Finder</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Start a scanning session to catalog books by ISBN.
          </p>
          {isAuthed ? (
            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <Link
                className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 font-medium text-white"
                href="/book-scan"
              >
                Scan Barcodes
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 font-medium text-neutral-700"
                href="/ocr"
              >
                OCR Capture
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 font-medium text-neutral-700"
                href="/config"
              >
                Config
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 font-medium text-neutral-700"
                href="/bookshelf"
              >
                Bookshelf
              </Link>
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 font-medium text-neutral-700 sm:col-span-2"
                onClick={() => {
                  tokenStore.clear();
                  setIsAuthed(false);
                  router.push("/login");
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white"
              href="/login"
            >
              Sign in to Scan
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
