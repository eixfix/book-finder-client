"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, tokenStore } from "@/lib/api";

type LoginResponse = {
  token: string;
  user: { id: number; email: string; name: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      tokenStore.set(response.token);
      router.push("/book-scan");
    } catch {
      setError("Login failed. Check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Use your admin credentials to access the scanner.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-600">Email</label>
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-600">Password</label>
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              className="h-11 w-full rounded-xl bg-black text-sm font-medium text-white disabled:opacity-60"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
