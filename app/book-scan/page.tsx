"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, tokenStore } from "@/lib/api";
import HamburgerNav from "@/components/HamburgerNav";

type ScanStatus = "loading" | "found_db" | "not_in_db" | "needs_manual" | "saved" | "error";

type ScanRow = {
  id: string;
  isbn: string;
  status: ScanStatus;
  title?: string;
  author?: string;
  coverUrl?: string;
  message?: string;
  bookId?: number;
  locationName?: string;
  shelfNumber?: string;
  qty?: number;
};

type LookupResponse = {
  found: boolean;
  source: "db" | "none";
  normalized_isbn: string;
  book?: { id: number; isbn: string; title: string; author: string; cover_url?: string };
  holdings?: {
    id: number;
    location_id: number;
    location_name: string;
    shelf_number: string;
    qty: number;
  }[];
};

type Location = { id: number; name: string };

type Candidate = {
  title: string;
  author: string;
  isbn?: string;
  source: "db" | "external";
  cover_url?: string;
  book_id?: number;
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
  book: { id: number; isbn: string; title: string; author: string; cover_url?: string };
};

export default function BookScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const loopRef = useRef<number | null>(null);

  const [isAuthed, setIsAuthed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"scan" | "manual">("scan");
  const [manualIsbn, setManualIsbn] = useState("");
  const [activeRow, setActiveRow] = useState<ScanRow | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [shelfNumber, setShelfNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookIsbn, setBookIsbn] = useState("");
  const [isbnLocked, setIsbnLocked] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [showOcr, setShowOcr] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrLang] = useState("eng");
  const [ocrCropCenter, setOcrCropCenter] = useState(false);
  const [ocrFocusMode, setOcrFocusMode] = useState<"full" | "title" | "author">("full");
  const [ocrEngine, setOcrEngine] = useState<"local" | "vision" | "ocrspace">("local");
  const [autoSearchOcr, setAutoSearchOcr] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [candidateRowId, setCandidateRowId] = useState<string | null>(null);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);
  const [ocrStream, setOcrStream] = useState<MediaStream | null>(null);
  const ocrVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!tokenStore.getSession()) {
      router.replace("/login");
      return;
    }
    setIsAuthed(true);
    return () => {
      stopScan();
    };
  }, [router]);

  useEffect(() => {
    let isActive = true;
    const timeout = setTimeout(async () => {
      if (!locationQuery.trim()) {
        setLocations([]);
        return;
      }
      try {
        const response = await apiFetch<{ data: Location[] }>(
          `/api/locations?search=${encodeURIComponent(locationQuery)}`
        );
        if (isActive) {
          setLocations(response.data);
        }
      } catch {
        if (isActive) {
          setLocations([]);
        }
      }
    }, 250);
    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [locationQuery]);

  useEffect(() => {
    if (scanMode === "manual") {
      stopScan();
    }
  }, [scanMode]);

  const normalizeIsbn = (value: string) => {
    const upper = value.toUpperCase();
    const cleaned = upper.replace(/[^0-9X]/g, "");
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      return "";
    }
    if (cleaned.length === 10) {
      const idx = cleaned.indexOf("X");
      if (idx !== -1 && idx !== 9) {
        return "";
      }
    }
    if (cleaned.length === 13 && !cleaned.startsWith("978") && !cleaned.startsWith("979")) {
      return "";
    }
    if (cleaned.length === 10 && !isValidISBN10(cleaned)) return "";
    if (cleaned.length === 13 && !isValidISBN13(cleaned)) return "";
    return cleaned;
  };

  const isValidISBN10 = (isbn: string) => {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const ch = isbn[i];
      const digit = ch === "X" ? 10 : Number(ch);
      sum += digit * (10 - i);
    }
    return sum % 11 === 0;
  };

  const isValidISBN13 = (isbn: string) => {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      const digit = Number(isbn[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(isbn[12]);
  };

  const startScan = async () => {
    setError(null);
    if (isScanning) return;
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ("BarcodeDetector" in window) {
        detectorRef.current = new BarcodeDetector({
          formats: ["ean_13", "upc_a"]
        });
        loopDetect();
      } else {
        await startZXing();
      }
    } catch (err) {
      setError("Camera access failed.");
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }

    if (zxingControlsRef.current) {
      zxingControlsRef.current.stop();
      zxingControlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsScanning(false);
  };

  const loopDetect = async () => {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const results = await detectorRef.current.detect(videoRef.current);
      if (results.length > 0) {
        handleDetected(results[0].rawValue);
      }
    } catch {
      // ignore scan errors
    }
    loopRef.current = requestAnimationFrame(loopDetect);
  };

  const startZXing = async () => {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromVideoDevice(
      undefined,
      videoRef.current ?? undefined,
      (result, decodeError, control) => {
        if (result) {
          handleDetected(result.getText());
        }
        if (!zxingControlsRef.current && control) {
          zxingControlsRef.current = control;
        }
        if (decodeError) {
          // ignore decode errors during scanning
        }
      }
    );
    zxingControlsRef.current = controls;
  };

  const handleDetected = (rawValue: string) => {
    const normalized = normalizeIsbn(rawValue);
    if (!normalized) return;
    if (seenRef.current.has(normalized)) return;
    seenRef.current.add(normalized);

    const rowId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${normalized}`;
    const newRow: ScanRow = { id: rowId, isbn: normalized, status: "loading" };
    setRows((prev) => [newRow, ...prev]);

    lookupISBN(normalized, rowId);
  };

  const submitManualIsbn = () => {
    setError(null);
    const normalized = normalizeIsbn(manualIsbn);
    if (!normalized) {
      setError("Invalid ISBN. Enter 10 or 13 digits.");
      return;
    }
    handleDetected(normalized);
    setManualIsbn("");
  };

  const lookupISBN = async (isbn: string, rowId: string) => {
    try {
      const response = await apiFetch<LookupResponse>(`/api/books/by-isbn/${isbn}`);
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          if (response.found && response.book) {
            const holdingSummary = response.holdings
              ?.map((holding) => `${holding.location_name} · ${holding.shelf_number} · qty ${holding.qty}`)
              .join(", ");
            return {
              ...row,
              status: "found_db",
              title: response.book.title,
              author: response.book.author,
              coverUrl: response.book.cover_url,
              bookId: response.book.id,
              message: holdingSummary
            };
          }
          return { ...row, status: "not_in_db" };
        })
      );
      if (!response.found) {
        await fetchCandidates(isbn, rowId);
      }
    } catch (err) {
      setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, status: "error" } : row)));
    }
  };

  const clearSession = () => {
    setRows([]);
    seenRef.current = new Set();
  };

  const openAddHolding = (row: ScanRow) => {
    setActiveRow(row);
    setShelfNumber("");
    setQty(1);
    setSelectedLocation(null);
    setLocationQuery("");
    setModalError(null);
    setShowAddHolding(true);
  };

  const openAddBook = (row: ScanRow, editableIsbn: boolean) => {
    setActiveRow(row);
    setBookTitle(row.title ?? "");
    setBookAuthor(row.author ?? "");
    setBookIsbn(row.isbn ?? "");
    setIsbnLocked(!editableIsbn);
    setShelfNumber("");
    setQty(1);
    setSelectedLocation(null);
    setLocationQuery("");
    setModalError(null);
    setShowAddBook(true);
  };

  const closeModals = () => {
    setShowAddBook(false);
    setShowAddHolding(false);
    setActiveRow(null);
    setModalError(null);
  };

  const saveHolding = async () => {
    if (!activeRow?.bookId) return;
    if (!selectedLocation || !shelfNumber.trim()) {
      setModalError("Location and shelf are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      await apiFetch<HoldingResponse>(`/api/books/${activeRow.bookId}/holdings`, {
        method: "POST",
        body: JSON.stringify({
          location_id: selectedLocation.id,
          shelf_number: shelfNumber,
          qty
        })
      });
      setRows((prev) =>
        prev.map((row) =>
          row.id === activeRow.id
            ? {
                ...row,
                status: "saved",
                locationName: selectedLocation.name,
                shelfNumber,
                qty
              }
            : row
        )
      );
      closeModals();
    } catch {
      setModalError("Failed to save holding.");
      setRows((prev) =>
        prev.map((row) => (row.id === activeRow.id ? { ...row, status: "error" } : row))
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveBookAndHolding = async () => {
    if (!activeRow) return;
    if (!bookIsbn.trim()) {
      setModalError("ISBN is required.");
      return;
    }
    if (!bookTitle.trim() || !bookAuthor.trim()) {
      setModalError("Title and author are required.");
      return;
    }
    if (!selectedLocation || !shelfNumber.trim()) {
      setModalError("Location and shelf are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      const response = await apiFetch<BookResponse>("/api/books", {
        method: "POST",
        body: JSON.stringify({
          isbn: bookIsbn,
          title: bookTitle,
          author: bookAuthor,
          cover_url: activeRow.coverUrl
        })
      });
      await apiFetch<HoldingResponse>(`/api/books/${response.book.id}/holdings`, {
        method: "POST",
        body: JSON.stringify({
          location_id: selectedLocation.id,
          shelf_number: shelfNumber,
          qty
        })
      });
      setRows((prev) =>
        prev.map((row) =>
          row.id === activeRow.id
            ? {
                ...row,
                status: "saved",
                bookId: response.book.id,
                isbn: bookIsbn,
                title: bookTitle,
                author: bookAuthor,
                coverUrl: activeRow.coverUrl,
                locationName: selectedLocation.name,
                shelfNumber,
                qty
              }
            : row
        )
      );
      closeModals();
    } catch {
      setModalError("Failed to save book and holding.");
      setRows((prev) =>
        prev.map((row) => (row.id === activeRow.id ? { ...row, status: "error" } : row))
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openOcr = () => {
    if (isScanning) {
      stopScan();
    }
    setShowOcr(true);
    setOcrText("");
    setOcrProgress(0);
    setOcrError(null);
    setCandidates([]);
    setShowCandidates(false);
  };

  const closeOcr = () => {
    stopOcrCamera();
    setShowOcr(false);
  };

  const startOcrCamera = async () => {
    setOcrError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      setOcrStream(stream);
      if (ocrVideoRef.current) {
        ocrVideoRef.current.srcObject = stream;
        await ocrVideoRef.current.play();
      }
    } catch {
      setOcrError("Camera access failed.");
    }
  };

  const stopOcrCamera = () => {
    if (ocrVideoRef.current) {
      ocrVideoRef.current.pause();
      ocrVideoRef.current.srcObject = null;
    }
    if (ocrStream) {
      ocrStream.getTracks().forEach((track) => track.stop());
      setOcrStream(null);
    }
  };

  const captureOcrFrame = async () => {
    if (!ocrVideoRef.current) return;
    const video = ocrVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) return;
    const file = new File([blob], "ocr-capture.jpg", { type: "image/jpeg" });
    await runOcrMultiPass(file);
  };

  const runOcr = async (file: File) => {
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrError(null);
    setOcrText("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker();
      await worker.loadLanguage(ocrLang);
      await worker.initialize(ocrLang);
      const prepared = await preprocessImage(file, {
        mode: ocrFocusMode,
        threshold: true,
        contrast: 150
      });
      const { data } = await worker.recognize(prepared);
      await worker.terminate();
      setOcrProgress(100);
      await applyOcrResult(data.text.trim());
    } catch (err) {
      setOcrError("OCR failed. Try again.");
    } finally {
      setOcrRunning(false);
    }
  };

  const preprocessImage = async (
    file: File,
    options: { mode: "full" | "title" | "author"; threshold: boolean; contrast: number }
  ) => {
    const img = await createImageBitmap(file);
    const maxWidth = 1600;
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    let cropX = ocrCropCenter ? Math.round(width * 0.05) : 0;
    let cropY = ocrCropCenter ? Math.round(height * 0.1) : 0;
    let cropW = ocrCropCenter ? Math.round(width * 0.9) : width;
    let cropH = ocrCropCenter ? Math.round(height * 0.7) : height;
    if (options.mode === "title") {
      cropY = Math.round(height * 0.05);
      cropH = Math.round(height * 0.45);
    }
    if (options.mode === "author") {
      cropY = Math.round(height * 0.45);
      cropH = Math.round(height * 0.35);
    }
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.filter = `grayscale(100%) contrast(${options.contrast}%)`;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    if (options.threshold) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i];
        const threshold = value > 160 ? 255 : 0;
        data[i] = threshold;
        data[i + 1] = threshold;
        data[i + 2] = threshold;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas;
  };

  const runOcrMultiPass = async (file: File) => {
    if (ocrEngine === "vision") {
      await runVisionOcr(file);
      return;
    }
    if (ocrEngine === "ocrspace") {
      await runOCRSpace(file);
      return;
    }
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrError(null);
    setOcrText("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker();
      await worker.loadLanguage(ocrLang);
      await worker.initialize(ocrLang);
      const passes = [{ mode: "full" as const, psm: 6, threshold: false, contrast: 150 }];
      let combined = "";
      for (let i = 0; i < passes.length; i += 1) {
        setOcrProgress(Math.round((i / passes.length) * 100));
        await worker.setParameters({ tessedit_pageseg_mode: passes[i].psm });
        const prepared = await preprocessImage(file, {
          mode: passes[i].mode,
          threshold: passes[i].threshold,
          contrast: passes[i].contrast
        });
        const { data } = await worker.recognize(prepared);
        combined += `\\n${data.text.trim()}`;
      }
      await worker.terminate();
      setOcrProgress(100);
      await applyOcrResult(combined.trim());
    } catch (err) {
      setOcrError("OCR failed. Try again.");
    } finally {
      setOcrRunning(false);
    }
  };

  const runVisionOcr = async (file: File) => {
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrError(null);
    setOcrText("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiFetch<{ text: string }>("/api/ocr/vision", {
        method: "POST",
        body: formData,
        headers: {}
      });
      setOcrProgress(100);
      await applyOcrResult(response.text.trim());
    } catch {
      setOcrError("Vision OCR failed. Check API key.");
    } finally {
      setOcrRunning(false);
    }
  };

  const runOCRSpace = async (file: File) => {
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrError(null);
    setOcrText("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiFetch<{ text: string }>("/api/ocr/space", {
        method: "POST",
        body: formData,
        headers: {}
      });
      setOcrProgress(100);
      await applyOcrResult(response.text.trim());
    } catch {
      setOcrError("OCR.space failed. Check API key.");
    } finally {
      setOcrRunning(false);
    }
  };

  const applyOcrResult = async (text: string) => {
    setOcrText(text);
    if (!autoSearchOcr) return;
    const queries = buildSearchQueries(text);
    if (queries.length > 0) {
      await searchWithFallback(queries);
    }
  };

  const buildSearchQueries = (text: string) => {
    if (!text.trim()) return [];
    const normalized = text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\b(sebuah|novel|komedi|oleh)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lines = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const title = lines[0] ?? normalized;
    const authorLine = lines.find((line) => /raditya dika/i.test(line));
    const upperLines = lines.filter((line) => /^[A-Z0-9\s]+$/.test(line));
    const combinedTitle =
      upperLines.length >= 2 ? `${upperLines[0]} ${upperLines[1]}`.trim() : "";
    const queries = [];
    if (authorLine) {
      queries.push(`${title} ${authorLine}`.trim());
      queries.push(authorLine);
    }
    if (combinedTitle) {
      queries.push(combinedTitle);
      if (authorLine) {
        queries.push(`${combinedTitle} ${authorLine}`.trim());
      }
    }
    queries.push(title);
    const titleTokens = title.split(" ").filter(Boolean);
    if (titleTokens.length > 1) {
      queries.push(`${titleTokens[0]} ${titleTokens[1]}`);
    }
    if (titleTokens.length > 0) {
      queries.push(titleTokens[0]);
    }
    queries.push(normalized);
    return Array.from(new Set(queries)).filter(Boolean);
  };

  const searchWithFallback = async (queries: string[]) => {
    for (let i = 0; i < queries.length; i += 1) {
      try {
        const response = await apiFetch<{ data: Candidate[] }>(
          `/api/books/search?q=${encodeURIComponent(queries[i])}`
        );
        if (response.data.length > 0) {
          setCandidates(response.data);
          setShowCandidates(true);
          return;
        }
      } catch {
        // ignore and continue fallback
      }
    }
    setCandidates([]);
    setShowCandidates(true);
  };

  const handleOcrFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await runOcrMultiPass(file);
  };

  const searchCandidates = async () => {
    const query = ocrText.replace(/\s+/g, " ").trim();
    if (!query) {
      setOcrError("No text extracted. Try again.");
      return;
    }
    await fetchCandidates(query);
  };

  const fetchCandidates = async (query: string, rowId?: string) => {
    setIsSearchingCandidates(true);
    try {
      const response = await apiFetch<{ data: Candidate[] }>(
        `/api/books/search?q=${encodeURIComponent(query)}`
      );
      setCandidates(response.data);
      if (rowId) {
        setCandidateRowId(rowId);
      }
      setShowCandidates(true);
    } catch {
      if (rowId) {
        setRows((prev) =>
          prev.map((row) => (row.id === rowId ? { ...row, status: "needs_manual" } : row))
        );
      } else {
        setOcrError("Search failed. Try again.");
      }
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const selectCandidate = (candidate?: Candidate) => {
    const resolvedId =
      candidateRowId ?? (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-ocr`);
    const existingRow = candidateRowId ? rows.find((row) => row.id === resolvedId) : undefined;
    const rowToEdit: ScanRow = {
      id: resolvedId,
      isbn: candidate?.isbn ?? existingRow?.isbn ?? "",
      status: "needs_manual",
      title: candidate?.title ?? existingRow?.title,
      author: candidate?.author ?? existingRow?.author,
      bookId: candidate?.book_id ?? existingRow?.bookId,
      coverUrl: candidate?.cover_url ?? existingRow?.coverUrl
    };

    if (candidateRowId) {
      setRows((prev) =>
        prev.map((row) => (row.id === resolvedId ? { ...row, ...rowToEdit } : row))
      );
    } else {
      setRows((prev) => [rowToEdit, ...prev]);
    }
    setShowCandidates(false);
    setShowOcr(false);
    setCandidateRowId(null);
    openAddBook(rowToEdit, true);
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
              <h1 className="text-xl font-semibold">Scan Books</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Scan ISBN barcodes to build a session list.
              </p>
            </div>
            <HamburgerNav />
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 text-xs">
            <button
              className={`rounded-lg px-3 py-1 ${
                scanMode === "scan" ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
              onClick={() => setScanMode("scan")}
            >
              Scan barcode ISBN
            </button>
            <button
              className={`rounded-lg px-3 py-1 ${
                scanMode === "manual" ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
              onClick={() => setScanMode("manual")}
            >
              Manual ISBN
            </button>
          </div>

          {scanMode === "scan" ? (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <button
                  className="h-10 flex-1 rounded-xl border border-neutral-300 text-sm"
                  onClick={isScanning ? stopScan : startScan}
                >
                  {isScanning ? "Stop" : "Start"}
                </button>
                <button
                  className="h-10 flex-1 rounded-xl border border-neutral-300 text-sm"
                  onClick={clearSession}
                >
                  Clear
                </button>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Camera preview above. Keep the barcode centered.
              </p>
            </>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <label className="text-xs text-neutral-600">ISBN</label>
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="Enter ISBN-10 or ISBN-13"
                value={manualIsbn}
                onChange={(event) => setManualIsbn(event.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="h-10 flex-1 rounded-xl bg-black px-4 py-2 text-xs text-white"
                  onClick={submitManualIsbn}
                >
                  Add to session
                </button>
                <button
                  className="h-10 flex-1 rounded-xl border border-neutral-300 text-xs text-neutral-700"
                  onClick={clearSession}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">Candidates</h2>
          <div className="mt-3 max-h-[45vh] overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-sm text-neutral-500">No scans yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
                  >
                    <div className="flex gap-3">
                      {row.coverUrl ? (
                        <img
                          src={row.coverUrl}
                          alt={`${row.title ?? row.isbn} cover`}
                          className="h-16 w-12 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-500">
                          No cover
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{row.isbn || "Manual entry"}</span>
                          {row.status !== "found_db" ? (
                            <span className="text-xs text-neutral-500">{row.status}</span>
                          ) : null}
                        </div>
                        {row.title ? (
                          <div className="mt-1 text-xs text-neutral-600">
                            {row.title} — {row.author}
                          </div>
                        ) : null}
                        {row.message ? (
                          <div className="mt-1 text-xs text-neutral-500">{row.message}</div>
                        ) : null}
                        {isSearchingCandidates && row.status === "not_in_db" ? (
                          <div className="mt-1 text-xs text-neutral-500">
                            Searching suggestions...
                          </div>
                        ) : null}
                        {row.locationName ? (
                          <div className="mt-1 text-xs text-neutral-500">
                            {row.locationName} · {row.shelfNumber} · qty {row.qty}
                          </div>
                        ) : null}
                        <div className="mt-2 flex gap-2 text-xs">
                          {row.status === "found_db" ? (
                            <button
                              className="rounded-lg border border-neutral-300 px-2 py-1"
                              onClick={() => openAddHolding(row)}
                            >
                              Add Bookshelf
                            </button>
                          ) : null}
                          {row.status === "not_in_db" || row.status === "needs_manual" ? (
                            <button
                              className="rounded-lg border border-neutral-300 px-2 py-1"
                              onClick={() => openAddBook(row, row.status === "needs_manual")}
                            >
                              Add Book
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {showAddHolding ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold">Add Holding</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-600">Location</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={locationQuery}
                  onChange={(event) => {
                    setLocationQuery(event.target.value);
                    setSelectedLocation(null);
                  }}
                  placeholder="Search location..."
                />
                {locations.length > 0 ? (
                  <div className="mt-2 max-h-32 overflow-auto rounded-xl border border-neutral-200">
                    {locations.map((loc) => (
                      <button
                        key={loc.id}
                        className={`block w-full px-3 py-2 text-left text-xs ${
                          selectedLocation?.id === loc.id ? "bg-neutral-100" : ""
                        }`}
                        onClick={() => {
                          setSelectedLocation(loc);
                          setLocationQuery(loc.name);
                        }}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                <button className="text-xs text-neutral-500" onClick={closeModals}>
                  Cancel
                </button>
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

      {showAddBook ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold">Add Book & Holding</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-neutral-600">ISBN</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={bookIsbn}
                  onChange={(event) => setBookIsbn(event.target.value)}
                  placeholder="978..."
                  disabled={isbnLocked}
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
              <div>
                <label className="text-xs text-neutral-600">Location</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                  value={locationQuery}
                  onChange={(event) => {
                    setLocationQuery(event.target.value);
                    setSelectedLocation(null);
                  }}
                  placeholder="Search location..."
                />
                {locations.length > 0 ? (
                  <div className="mt-2 max-h-32 overflow-auto rounded-xl border border-neutral-200">
                    {locations.map((loc) => (
                      <button
                        key={loc.id}
                        className={`block w-full px-3 py-2 text-left text-xs ${
                          selectedLocation?.id === loc.id ? "bg-neutral-100" : ""
                        }`}
                        onClick={() => {
                          setSelectedLocation(loc);
                          setLocationQuery(loc.name);
                        }}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                <button className="text-xs text-neutral-500" onClick={closeModals}>
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-60"
                  onClick={saveBookAndHolding}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCandidates ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Pick a Candidate</h3>
              <button
                className="text-xs text-neutral-500"
                onClick={() => setShowCandidates(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {candidates.length === 0 ? (
                <p className="text-xs text-neutral-600">No candidates found.</p>
              ) : (
                candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.title}-${candidate.author}-${index}`}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-left"
                    onClick={() => selectCandidate(candidate)}
                  >
                    <div className="flex gap-3">
                      {candidate.cover_url ? (
                        <img
                          src={candidate.cover_url}
                          alt={`${candidate.title} cover`}
                          className="h-16 w-12 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-500">
                          No cover
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold">{candidate.title}</div>
                        <div className="text-xs text-neutral-500">{candidate.author}</div>
                        <div className="text-[11px] text-neutral-400">
                          {candidate.isbn ? `ISBN ${candidate.isbn}` : "No ISBN"} ·{" "}
                          {candidate.source}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
              <button
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-left text-xs"
                onClick={() => selectCandidate(undefined)}
              >
                Manual entry
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}
