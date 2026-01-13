"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HamburgerNav from "@/components/HamburgerNav";
import { apiFetch, tokenStore } from "@/lib/api";

type Location = { id: number; name: string };

type SettingsPayload = {
  google_books_api_key: string;
  google_vision_api_key: string;
  ocr_space_api_key: string;
};

export default function ConfigPage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);

  const [googleBooksKey, setGoogleBooksKey] = useState("");
  const [googleVisionKey, setGoogleVisionKey] = useState("");
  const [ocrSpaceKey, setOcrSpaceKey] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.getSession()) {
      router.replace("/login");
      return;
    }
    setIsAuthed(true);
  }, [router]);

  const loadLocations = async () => {
    try {
      const response = await apiFetch<{ data: Location[] }>("/api/locations?limit=50");
      setLocations(response.data);
    } catch {
      setLocations([]);
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    const loadSettings = async () => {
      try {
        const response = await apiFetch<SettingsPayload>("/api/settings");
        setGoogleBooksKey(response.google_books_api_key ?? "");
        setGoogleVisionKey(response.google_vision_api_key ?? "");
        setOcrSpaceKey(response.ocr_space_api_key ?? "");
      } catch {
        setSettingsMessage("Failed to load settings.");
      }
    };
    loadSettings();
    loadLocations();
  }, [isAuthed]);

  const createLocation = async () => {
    const name = newLocation.trim();
    if (!name) {
      setLocationError("Location name is required.");
      return;
    }
    setLocationSaving(true);
    setLocationError(null);
    try {
      await apiFetch<{ location: Location }>("/api/locations", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setNewLocation("");
      await loadLocations();
    } catch {
      setLocationError("Failed to save location.");
    } finally {
      setLocationSaving(false);
    }
  };

  const deleteLocation = async (locationId: number) => {
    setLocationError(null);
    try {
      await apiFetch(`/api/locations/${locationId}`, { method: "DELETE" });
      await loadLocations();
    } catch {
      setLocationError("Location has holdings and cannot be deleted.");
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      await apiFetch<SettingsPayload>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          google_books_api_key: googleBooksKey,
          google_vision_api_key: googleVisionKey,
          ocr_space_api_key: ocrSpaceKey
        })
      });
      setSettingsMessage("Settings saved.");
    } catch {
      setSettingsMessage("Failed to save settings.");
    } finally {
      setSettingsSaving(false);
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
              <h1 className="text-xl font-semibold">Config</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Manage locations and external metadata settings.
              </p>
            </div>
            <HamburgerNav />
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">Locations</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Create locations for bookshelf assignments.
          </p>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="New location name"
                value={newLocation}
                onChange={(event) => setNewLocation(event.target.value)}
              />
              <button
                className="rounded-xl bg-black px-4 py-2 text-xs text-white disabled:opacity-60"
                onClick={createLocation}
                disabled={locationSaving}
              >
                {locationSaving ? "Saving..." : "Add"}
              </button>
            </div>
            {locationError ? (
              <p className="text-xs text-red-600">{locationError}</p>
            ) : null}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200">
              {locations.length === 0 ? (
                <p className="px-3 py-3 text-xs text-neutral-500">No locations yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {locations.map((loc) => (
                    <li
                      key={loc.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-neutral-700"
                    >
                      <span>{loc.name}</span>
                      <button
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600"
                        onClick={() => deleteLocation(loc.id)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">External API Keys</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Configure keys for external metadata and OCR services.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="text-xs text-neutral-600">Google Books API Key</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={googleBooksKey}
                onChange={(event) => setGoogleBooksKey(event.target.value)}
                placeholder="AIza..."
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">Google Vision API Key</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={googleVisionKey}
                onChange={(event) => setGoogleVisionKey(event.target.value)}
                placeholder="AIza..."
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">OCR.space API Key</label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={ocrSpaceKey}
                onChange={(event) => setOcrSpaceKey(event.target.value)}
                placeholder="helloworld"
              />
            </div>
            {settingsMessage ? (
              <p className="text-xs text-neutral-600">{settingsMessage}</p>
            ) : null}
            <div className="flex justify-end">
              <button
                className="rounded-xl bg-black px-4 py-2 text-xs text-white disabled:opacity-60"
                onClick={saveSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
