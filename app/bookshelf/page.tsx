"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HamburgerNav from "@/components/HamburgerNav";
import { apiFetch, tokenStore } from "@/lib/api";

type Location = { id: number; name: string };

type BookshelfHolding = {
  id: number;
  location_id: number;
  location: string;
  shelf: string;
  qty: number;
};

type BookshelfBook = {
  book_id: number;
  isbn: string;
  title: string;
  author: string;
  total_qty: number;
  holdings: BookshelfHolding[];
};

type HoldingResponse = {
  holding: {
    id: number;
    location_id: number;
    location_name: string;
    shelf_number: string;
    qty: number;
  };
};

type BookResponse = {
  book: {
    id: number;
    isbn: string;
    title: string;
    author: string;
  };
};

type BookshelfResponse = {
  data: BookshelfBook[];
  paging: { limit: number; offset: number; total: number };
};

export default function BookshelfPage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [items, setItems] = useState<BookshelfBook[]>([]);
  const [titleQuery, setTitleQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [isbnQuery, setIsbnQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [shelfQuery, setShelfQuery] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 50;
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookshelfBook | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<BookshelfHolding | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [showEditHolding, setShowEditHolding] = useState(false);
  const [returnToDetail, setReturnToDetail] = useState(false);
  const [showEditBook, setShowEditBook] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [shelfNumber, setShelfNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [bookIsbn, setBookIsbn] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.getSession()) {
      router.replace("/login");
      return;
    }
    setIsAuthed(true);
  }, [router]);

  useEffect(() => {
    if (!isAuthed) return;
    const loadLocations = async () => {
      try {
        const response = await apiFetch<{ data: Location[] }>("/api/locations?limit=100");
        setLocations(response.data);
      } catch {
        setLocations([]);
      }
    };
    loadLocations();
  }, [isAuthed]);

  const loadBookshelf = async (active: { value: boolean }) => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (titleQuery.trim()) params.set("title", titleQuery.trim());
    if (authorQuery.trim()) params.set("author", authorQuery.trim());
    if (isbnQuery.trim()) params.set("isbn", isbnQuery.trim());
    if (locationQuery.trim()) params.set("location", locationQuery.trim());
    if (shelfQuery.trim()) params.set("shelf", shelfQuery.trim());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    try {
      const response = await apiFetch<BookshelfResponse>(
        `/api/bookshelf?${params.toString()}`
      );
      if (active.value) {
        setItems(response.data);
        setTotalCount(response.paging.total);
      }
    } catch {
      if (active.value) {
        setError("Failed to load bookshelf items.");
        setItems([]);
      }
    } finally {
      if (active.value) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    let isActive = { value: true };
    const timeout = setTimeout(() => {
      loadBookshelf(isActive);
    }, 250);
    return () => {
      isActive.value = false;
      clearTimeout(timeout);
    };
  }, [titleQuery, authorQuery, isbnQuery, locationQuery, shelfQuery, offset, isAuthed]);

  useEffect(() => {
    setOffset(0);
  }, [titleQuery, authorQuery, isbnQuery, locationQuery, shelfQuery]);

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-4 py-12">
        <div className="mx-auto max-w-screen-md rounded-2xl border bg-white p-6 text-sm text-neutral-600">
          Redirecting to login...
        </div>
      </main>
    );
  }

  const openDetail = (book: BookshelfBook) => {
    setSelectedBook(book);
    setShowDetail(true);
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedBook(null);
    setSelectedHolding(null);
  };

  const openEditBook = (book: BookshelfBook) => {
    setSelectedBook(book);
    setBookIsbn(book.isbn);
    setBookTitle(book.title);
    setBookAuthor(book.author);
    setModalError(null);
    setShowDetail(false);
    setShowEditBook(true);
  };

  const closeEditBook = () => {
    setShowEditBook(false);
    setModalError(null);
    if (selectedBook) {
      setShowDetail(true);
    }
  };

  const openAddHolding = (book: BookshelfBook) => {
    setSelectedBook(book);
    setSelectedHolding(null);
    setSelectedLocation(null);
    setShelfNumber("");
    setQty(1);
    setModalError(null);
    setReturnToDetail(true);
    setShowDetail(false);
    setShowAddHolding(true);
  };

  const openEditHolding = (book: BookshelfBook, holding: BookshelfHolding) => {
    setSelectedBook(book);
    setSelectedHolding(holding);
    const location = locations.find((loc) => loc.id === holding.location_id) ?? null;
    setSelectedLocation(location);
    setShelfNumber(holding.shelf);
    setQty(holding.qty);
    setModalError(null);
    setReturnToDetail(true);
    setShowDetail(false);
    setShowEditHolding(true);
  };

  const closeAddHolding = () => {
    setShowAddHolding(false);
    setModalError(null);
    if (returnToDetail && selectedBook) {
      setShowDetail(true);
      setReturnToDetail(false);
    }
  };

  const closeEditHolding = () => {
    setShowEditHolding(false);
    setModalError(null);
    if (returnToDetail && selectedBook) {
      setShowDetail(true);
      setReturnToDetail(false);
    }
  };

  const saveHolding = async () => {
    if (!selectedBook) return;
    if (!selectedLocation || !shelfNumber.trim()) {
      setModalError("Location and shelf are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      await apiFetch<HoldingResponse>(`/api/books/${selectedBook.book_id}/holdings`, {
        method: "POST",
        body: JSON.stringify({
          location_id: selectedLocation.id,
          shelf_number: shelfNumber,
          qty
        })
      });
      closeAddHolding();
      await loadBookshelf({ value: true });
    } catch {
      setModalError("Failed to add holding.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateHolding = async () => {
    if (!selectedHolding) return;
    if (!selectedLocation || !shelfNumber.trim()) {
      setModalError("Location and shelf are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      await apiFetch<HoldingResponse>(`/api/holdings/${selectedHolding.id}`, {
        method: "PUT",
        body: JSON.stringify({
          location_id: selectedLocation.id,
          shelf_number: shelfNumber,
          qty
        })
      });
      closeEditHolding();
      await loadBookshelf({ value: true });
    } catch {
      setModalError("Failed to update holding.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteHolding = async (holdingId: number) => {
    setModalError(null);
    try {
      await apiFetch(`/api/holdings/${holdingId}`, { method: "DELETE" });
      await loadBookshelf({ value: true });
      if (selectedBook) {
        const refreshed = await apiFetch<{ data: BookshelfBook[] }>(
          `/api/bookshelf?isbn=${encodeURIComponent(selectedBook.isbn)}&limit=50`
        );
        const updated = refreshed.data.find((item) => item.book_id === selectedBook.book_id);
        if (updated) {
          setSelectedBook(updated);
        } else {
          closeDetail();
        }
      }
    } catch {
      setModalError("Failed to delete holding.");
    }
  };

  const updateBook = async () => {
    if (!selectedBook) return;
    if (!bookIsbn.trim() || !bookTitle.trim() || !bookAuthor.trim()) {
      setModalError("ISBN, title, and author are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      await apiFetch<BookResponse>(`/api/books/${selectedBook.book_id}`, {
        method: "PUT",
        body: JSON.stringify({
          isbn: bookIsbn,
          title: bookTitle,
          author: bookAuthor
        })
      });
      await loadBookshelf({ value: true });
      setShowEditBook(false);
      const refreshed = await apiFetch<{ data: BookshelfBook[] }>(
        `/api/bookshelf?isbn=${encodeURIComponent(bookIsbn)}&limit=50`
      );
      const updated = refreshed.data.find((item) => item.book_id === selectedBook.book_id);
      if (updated) {
        setSelectedBook(updated);
      }
      setShowDetail(true);
    } catch {
      setModalError("Failed to update book.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-4 pb-24 pt-6">
      <div className="mx-auto flex max-w-screen-md flex-col gap-4">
        <header className="sticky top-4 z-20 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Bookshelf</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Browse cataloged books across locations.
              </p>
            </div>
            <HamburgerNav />
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <label className="text-xs text-neutral-600">Filters</label>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Title"
              value={titleQuery}
              onChange={(event) => setTitleQuery(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Author"
              value={authorQuery}
              onChange={(event) => setAuthorQuery(event.target.value)}
            />
          </div>
          <button
            className="mt-3 text-xs text-neutral-500 underline"
            onClick={() => setShowMoreFilters((prev) => !prev)}
          >
            {showMoreFilters ? "Hide filters" : "More filters"}
          </button>
          {showMoreFilters ? (
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="ISBN"
                value={isbnQuery}
                onChange={(event) => setIsbnQuery(event.target.value)}
              />
              <select
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={locationQuery}
                onChange={(event) => setLocationQuery(event.target.value)}
              >
                <option value="">All locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.name}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="Shelf"
                value={shelfQuery}
                onChange={(event) => setShelfQuery(event.target.value)}
              />
            </div>
          ) : null}
          {isLoading ? (
            <p className="mt-2 text-xs text-neutral-500">Loading...</p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="max-h-[50vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-neutral-500">No bookshelf items yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {items.map((item) => (
                  <button
                    key={item.book_id}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-left"
                    onClick={() => openDetail(item)}
                  >
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-xs text-neutral-600">{item.author}</div>
                    <div className="mt-1 text-xs text-neutral-500">ISBN {item.isbn}</div>
                    <div className="mt-2 text-xs text-neutral-600">
                      {item.holdings.length} shelves · qty {item.total_qty}
                    </div>
                  </button>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {totalCount === 0
                ? "0 results"
                : `${offset + 1}-${Math.min(offset + limit, totalCount)} of ${totalCount}`}
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-60"
                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                disabled={offset === 0}
              >
                Previous
              </button>
              <button
                className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-60"
                onClick={() => setOffset((prev) => prev + limit)}
                disabled={offset + limit >= totalCount}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {showDetail && selectedBook ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">{selectedBook.title}</h3>
                <p className="text-xs text-neutral-500">{selectedBook.author}</p>
              </div>
              <button className="text-xs text-neutral-500" onClick={closeDetail}>
                Close
              </button>
            </div>
            <div className="mt-2 text-xs text-neutral-500">ISBN {selectedBook.isbn}</div>
            <div className="mt-4 space-y-2 text-xs">
              {selectedBook.holdings.map((holding) => (
                <div
                  key={holding.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2"
                >
                  <div>
                    {holding.location} · {holding.shelf} · qty {holding.qty}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-[11px]"
                      onClick={() => openEditHolding(selectedBook, holding)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-[11px] text-red-600"
                      onClick={() => deleteHolding(holding.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
                  onClick={() => openEditBook(selectedBook)}
                >
                  Edit Book
                </button>
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white"
                  onClick={() => openAddHolding(selectedBook)}
                >
                  Add Bookshelf
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAddHolding ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Add Bookshelf</h3>
              <button className="text-xs text-neutral-500" onClick={closeAddHolding}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-600">Location</label>
                <select
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={selectedLocation?.id ?? ""}
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    setSelectedLocation(locations.find((loc) => loc.id === id) ?? null);
                  }}
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-neutral-600">Shelf</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                    value={shelfNumber}
                    onChange={(event) => setShelfNumber(event.target.value)}
                    placeholder="A-12"
                  />
                </div>
                <div className="w-20">
                  <label className="text-xs text-neutral-600">Qty</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(event) => setQty(Number(event.target.value))}
                  />
                </div>
              </div>
              {modalError ? <p className="text-xs text-red-600">{modalError}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-60"
                  onClick={saveHolding}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEditHolding ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Edit Bookshelf</h3>
              <button className="text-xs text-neutral-500" onClick={closeEditHolding}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-600">Location</label>
                <select
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={selectedLocation?.id ?? ""}
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    setSelectedLocation(locations.find((loc) => loc.id === id) ?? null);
                  }}
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-neutral-600">Shelf</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                    value={shelfNumber}
                    onChange={(event) => setShelfNumber(event.target.value)}
                    placeholder="A-12"
                  />
                </div>
                <div className="w-20">
                  <label className="text-xs text-neutral-600">Qty</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(event) => setQty(Number(event.target.value))}
                  />
                </div>
              </div>
              {modalError ? <p className="text-xs text-red-600">{modalError}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-60"
                  onClick={updateHolding}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEditBook ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Edit Book</h3>
              <button className="text-xs text-neutral-500" onClick={closeEditBook}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-600">ISBN</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={bookIsbn}
                  onChange={(event) => setBookIsbn(event.target.value)}
                  placeholder="978..."
                />
              </div>
              <div>
                <label className="text-xs text-neutral-600">Title</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                  placeholder="Book title"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-600">Author</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={bookAuthor}
                  onChange={(event) => setBookAuthor(event.target.value)}
                  placeholder="Author name"
                />
              </div>
              {modalError ? <p className="text-xs text-red-600">{modalError}</p> : null}
              <div className="flex justify-end">
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-60"
                  onClick={updateBook}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
