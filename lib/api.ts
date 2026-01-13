const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const FALLBACK_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "";
const TOKEN_KEY = "book_finder_token";

export const tokenStore = {
  get(): string {
    if (typeof window === "undefined") return FALLBACK_TOKEN;
    return localStorage.getItem(TOKEN_KEY) ?? FALLBACK_TOKEN;
  },
  getSession(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
  }
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}
