"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HamburgerNav from "@/components/HamburgerNav";
import { apiFetch, tokenStore } from "@/lib/api";

type CreateUserResponse = {
  user: { id: number; email: string; name: string };
};

type UsersResponse = {
  data: { id: number; email: string; name: string }[];
};

export default function ConfigUsersPage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | null>(null);
  const [users, setUsers] = useState<UsersResponse["data"]>([]);

  useEffect(() => {
    if (!tokenStore.getSession()) {
      router.replace("/login");
      return;
    }
    setIsAuthed(true);
  }, [router]);

  const loadUsers = async () => {
    try {
      const response = await apiFetch<UsersResponse>("/api/users");
      setUsers(response.data);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    loadUsers();
  }, [isAuthed]);

  const createUser = async () => {
    setMessage(null);
    setMessageTone(null);
    if (!email.trim() || !password.trim()) {
      setMessage("Email and password are required.");
      setMessageTone("error");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setMessageTone("error");
      return;
    }
    setIsSaving(true);
    try {
      await apiFetch<CreateUserResponse>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          name
        })
      });
      setMessage("User created.");
      setMessageTone("success");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      await loadUsers();
    } catch {
      setMessage("Failed to create user.");
      setMessageTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-4 py-12">
        <div className="mx-auto max-w-screen-md rounded-2xl border bg-white p-6 text-sm text-neutral-600">
          Redirecting to login...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-4 pb-24 pt-6">
      <div className="mx-auto flex max-w-screen-md flex-col gap-4">
        <header className="sticky top-4 z-20 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Add User</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Create a new account with email and password.
              </p>
            </div>
            <HamburgerNav />
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs text-neutral-600">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Email</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@email.com"
                type="email"
                required
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Password</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                type="password"
                required
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Confirm Password</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
                type="password"
                required
              />
            </div>
            {message ? (
              <p
                className={`text-xs ${
                  messageTone === "success" ? "text-green-600" : "text-red-600"
                }`}
              >
                {message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs"
                onClick={() => router.push("/config")}
              >
                Back to Config
              </button>
              <button
                className="rounded-xl bg-black px-4 py-2 text-xs text-white disabled:opacity-60"
                onClick={createUser}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Create user"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">Users</h2>
          <p className="mt-1 text-xs text-neutral-500">Existing accounts with access.</p>
          <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-neutral-200">
            {users.length === 0 ? (
              <p className="px-3 py-3 text-xs text-neutral-500">No users found.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {users.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center justify-between px-3 py-2 text-xs text-neutral-700"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{user.name || "Unnamed user"}</span>
                      <span className="text-[11px] text-neutral-500">{user.email}</span>
                    </div>
                    <span className="text-[11px] text-neutral-400">ID {user.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
