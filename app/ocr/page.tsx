"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, tokenStore } from "@/lib/api";
import HamburgerNav from "@/components/HamburgerNav";

type Location = { id: number; name: string };

type Candidate = {
  title: string;
  author: string;
  isbn?: string;
  source: "db" | "external";
  cover_url?: string;
  book_id?: number;
  holdings?: {
    id: number;
    location_id: number;
    location_name: string;
    shelf_number: string;
    qty: number;
  }[];
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
  book: { id: number; isbn: string; title: string; author: string };
};

export default function OcrPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraModalRef = useRef<HTMLVideoElement | null>(null);

  const [isAuthed, setIsAuthed] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrCropCenter, setOcrCropCenter] = useState(false);
  const [ocrFocusMode, setOcrFocusMode] = useState<"full" | "title" | "author">("full");
  const [ocrEngine, setOcrEngine] = useState<"local" | "vision" | "ocrspace">("vision");
  const [captureMode, setCaptureMode] = useState<"camera" | "file">("camera");
  const [autoSearchOcr, setAutoSearchOcr] = useState(true);
  const [ocrStream, setOcrStream] = useState<MediaStream | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [hasDbCandidates, setHasDbCandidates] = useState(false);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);

  const [showAddBook, setShowAddBook] = useState(false);
  const [showHolding, setShowHolding] = useState(false);
  const [showDbDetail, setShowDbDetail] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [returnToCandidates, setReturnToCandidates] = useState(false);
  const [returnToDbDetail, setReturnToDbDetail] = useState(false);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [shelfNumber, setShelfNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookIsbn, setBookIsbn] = useState("");
  const [bookCoverUrl, setBookCoverUrl] = useState("");
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

  const clearOcr = () => {
    setOcrText("");
    setOcrError(null);
    setOcrProgress(0);
    setCandidates([]);
    setShowCandidates(false);
    setHasDbCandidates(false);
  };

  useEffect(() => {
    if (!showCameraModal || !ocrStream || !cameraModalRef.current) return;
    cameraModalRef.current.srcObject = ocrStream;
    cameraModalRef.current.play().catch(() => {
      setOcrError("Camera playback failed.");
    });
  }, [showCameraModal, ocrStream]);

  const startOcrCamera = async () => {
    setOcrError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      setOcrStream(stream);
      setShowCameraModal(true);
    } catch {
      setOcrError("Camera access failed.");
    }
  };

  const stopOcrCamera = () => {
    if (cameraModalRef.current) {
      cameraModalRef.current.pause();
      cameraModalRef.current.srcObject = null;
    }
    if (ocrStream) {
      ocrStream.getTracks().forEach((track) => track.stop());
      setOcrStream(null);
    }
    setShowCameraModal(false);
  };

  const captureOcrFrame = async () => {
    const video = cameraModalRef.current ?? ocrVideoRef.current;
    if (!video) return;
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
    stopOcrCamera();
    await runOcrMultiPass(file);
  };

  const runOcrMultiPass = async (file: File) => {
    const preparedFile = await cropFileToBox(file);
    if (ocrEngine === "vision") {
      await runVisionOcr(preparedFile);
      return;
    }
    if (ocrEngine === "ocrspace") {
      await runOCRSpace(preparedFile);
      return;
    }
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrError(null);
    setOcrText("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker();
      await worker.loadLanguage("eng");
      await worker.initialize("eng");
      const passes = [{ mode: "full" as const, psm: 6, threshold: false, contrast: 150 }];
      let combined = "";
      for (let i = 0; i < passes.length; i += 1) {
        setOcrProgress(Math.round((i / passes.length) * 100));
        await worker.setParameters({ tessedit_pageseg_mode: passes[i].psm });
        const prepared = await preprocessImage(preparedFile, {
          mode: passes[i].mode,
          threshold: passes[i].threshold,
          contrast: passes[i].contrast
        });
        const { data } = await worker.recognize(prepared);
        combined += `\n${data.text.trim()}`;
      }
      await worker.terminate();
      setOcrProgress(100);
      await applyOcrResult(combined.trim());
    } catch {
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

  const getCropBoxMetrics = () => {
    const base = { left: 0.05, width: 0.9 };
    if (!ocrCropCenter) {
      return { ...base, top: 0.1, height: 0.7 };
    }
    if (ocrFocusMode === "title") {
      return { ...base, top: 0.05, height: 0.45 };
    }
    if (ocrFocusMode === "author") {
      return { ...base, top: 0.45, height: 0.35 };
    }
    return { ...base, top: 0.1, height: 0.7 };
  };

  const getCropBoxStyle = () => {
    const box = getCropBoxMetrics();
    return {
      left: `${box.left * 100}%`,
      top: `${box.top * 100}%`,
      width: `${box.width * 100}%`,
      height: `${box.height * 100}%`
    };
  };

  const cropFileToBox = async (file: File) => {
    const img = await createImageBitmap(file);
    const box = getCropBoxMetrics();
    const cropX = Math.round(img.width * box.left);
    const cropY = Math.round(img.height * box.top);
    const cropW = Math.round(img.width * box.width);
    const cropH = Math.round(img.height * box.height);
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) return file;
    return new File([blob], file.name || "ocr-crop.jpg", { type: "image/jpeg" });
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

  const fetchCandidates = async (query: string) => {
    setIsSearchingCandidates(true);
    try {
      const response = await apiFetch<{ data: Candidate[] }>(
        `/api/books/search?q=${encodeURIComponent(query)}`
      );
      setCandidates(response.data);
      setHasDbCandidates(response.data.some((candidate) => candidate.source === "db"));
      setShowCandidates(true);
    } catch {
      setOcrError("Search failed. Try again.");
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const searchOnline = async () => {
    const query = ocrText.replace(/\s+/g, " ").trim();
    if (!query) {
      setOcrError("No text extracted. Try again.");
      return;
    }
    setIsSearchingCandidates(true);
    try {
      const response = await apiFetch<{ data: Candidate[] }>(
        `/api/books/search?q=${encodeURIComponent(query)}&force_external=true`
      );
      setCandidates(response.data);
      setShowCandidates(true);
    } catch {
      setOcrError("Search failed. Try again.");
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const searchWithFallback = async (queries: string[]) => {
    for (let i = 0; i < queries.length; i += 1) {
      try {
        const response = await apiFetch<{ data: Candidate[] }>(
          `/api/books/search?q=${encodeURIComponent(queries[i])}`
        );
        if (response.data.length > 0) {
          setCandidates(response.data);
          setHasDbCandidates(response.data.some((candidate) => candidate.source === "db"));
          setShowCandidates(true);
          return;
        }
      } catch {
        // ignore and continue fallback
      }
    }
    setCandidates([]);
    setHasDbCandidates(false);
    setShowCandidates(true);
  };

  const openAddBook = (candidate?: Candidate) => {
    if (candidate?.source === "db" && candidate.book_id) {
      setSelectedCandidate(candidate);
      setShowCandidates(false);
      setShowDbDetail(true);
      return;
    }
    setBookTitle(candidate?.title ?? "");
    setBookAuthor(candidate?.author ?? "");
    setBookIsbn(candidate?.isbn ?? "");
    setBookCoverUrl(candidate?.cover_url ?? "");
    setShelfNumber("");
    setQty(1);
    setSelectedLocation(null);
    setLocationQuery("");
    setModalError(null);
    setShowCandidates(false);
    setReturnToCandidates(true);
    setShowAddBook(true);
  };

  const closeAddBook = () => {
    setShowAddBook(false);
    setModalError(null);
    if (returnToCandidates) {
      setShowCandidates(true);
      setReturnToCandidates(false);
    }
  };

  const closeHolding = () => {
    setShowHolding(false);
    setActiveBookId(null);
    setModalError(null);
    if (returnToDbDetail && selectedCandidate) {
      setShowDbDetail(true);
      setReturnToDbDetail(false);
    }
  };

  const closeDbDetail = () => {
    setShowDbDetail(false);
    setSelectedCandidate(null);
  };

  const openHoldingFromDetail = () => {
    if (!selectedCandidate?.book_id) return;
    setActiveBookId(selectedCandidate.book_id);
    setShelfNumber("");
    setQty(1);
    setSelectedLocation(null);
    setLocationQuery("");
    setModalError(null);
    setShowDbDetail(false);
    setReturnToDbDetail(true);
    setShowHolding(true);
  };

  const saveBookAndHolding = async () => {
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
          cover_url: bookCoverUrl
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
      closeAddBook();
    } catch {
      setModalError("Failed to save book and holding.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveHolding = async () => {
    if (!activeBookId) return;
    if (!selectedLocation || !shelfNumber.trim()) {
      setModalError("Location and shelf are required.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      await apiFetch<HoldingResponse>(`/api/books/${activeBookId}/holdings`, {
        method: "POST",
        body: JSON.stringify({
          location_id: selectedLocation.id,
          shelf_number: shelfNumber,
          qty
        })
      });
      closeHolding();
    } catch {
      setModalError("Failed to save holding.");
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
              <h1 className="text-xl font-semibold">OCR Capture</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Capture a book cover and find candidates.
              </p>
            </div>
            <HamburgerNav />
          </div>
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={ocrCropCenter}
                onChange={(event) => setOcrCropCenter(event.target.checked)}
                disabled={ocrRunning}
              />
              Focus center
            </label>
            <select
              className="rounded-lg border border-neutral-300 px-2 py-1"
              value={ocrFocusMode}
              onChange={(event) =>
                setOcrFocusMode(event.target.value as "full" | "title" | "author")
              }
              disabled={ocrRunning}
            >
              <option value="full">Full frame</option>
              <option value="title">Title pass</option>
              <option value="author">Author pass</option>
            </select>
            <select
              className="rounded-lg border border-neutral-300 px-2 py-1"
              value={ocrEngine}
              onChange={(event) =>
                setOcrEngine(event.target.value as "local" | "vision" | "ocrspace")
              }
              disabled={ocrRunning}
            >
              <option value="local">Local OCR</option>
              <option value="vision">Google Vision</option>
              <option value="ocrspace">OCR.space</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={autoSearchOcr}
                onChange={(event) => setAutoSearchOcr(event.target.checked)}
                disabled={ocrRunning}
              />
              Auto search
            </label>
          </div>

          <div className="mt-4 space-y-3">
            <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 text-xs">
              <button
                className={`rounded-lg px-3 py-1 ${
                  captureMode === "camera" ? "bg-white shadow-sm" : "text-neutral-500"
                }`}
                onClick={() => setCaptureMode("camera")}
                disabled={ocrRunning}
              >
                Live camera
              </button>
              <button
                className={`rounded-lg px-3 py-1 ${
                  captureMode === "file" ? "bg-white shadow-sm" : "text-neutral-500"
                }`}
                onClick={() => setCaptureMode("file")}
                disabled={ocrRunning}
              >
                Upload file
              </button>
            </div>

            {captureMode === "file" ? (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOcrFile}
                className="text-xs"
              />
            ) : (
              <>
                <div className="flex gap-2 text-xs">
                  <button
                    className="rounded-lg border border-neutral-300 px-2 py-1"
                    onClick={startOcrCamera}
                    disabled={ocrRunning}
                  >
                    Open camera
                  </button>
                </div>
              </>
            )}
          </div>

          {ocrRunning ? (
            <div className="mt-3 text-xs text-neutral-600">Processing... {ocrProgress}%</div>
          ) : null}
          {isSearchingCandidates ? (
            <div className="mt-2 text-xs text-neutral-600">Searching suggestions...</div>
          ) : null}
          {ocrError ? <p className="mt-2 text-xs text-red-600">{ocrError}</p> : null}

          <textarea
            className="mt-3 h-40 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs"
            value={ocrText}
            onChange={(event) => setOcrText(event.target.value)}
            placeholder="OCR text will appear here"
          />

          <div className="mt-3 flex justify-end gap-2">
            <button
              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
              onClick={clearOcr}
              disabled={ocrRunning}
            >
              Clear OCR
            </button>
            <button
              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
              onClick={searchCandidates}
              disabled={ocrRunning}
            >
              Search Candidates
            </button>
          </div>
        </section>

      {showCandidates ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-semibold text-neutral-700">Candidates</h2>
              <button
                className="text-xs text-neutral-500"
                onClick={() => setShowCandidates(false)}
              >
                Close
              </button>
            </div>
              <div className="mt-3 space-y-2 text-sm">
                {candidates.length === 0 ? (
                  <p className="text-xs text-neutral-600">No candidates found.</p>
                ) : (
                  candidates.map((candidate, index) => (
                    <button
                      key={`${candidate.title}-${candidate.author}-${index}`}
                      className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-left"
                      onClick={() => openAddBook(candidate)}
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
                            {candidate.isbn ? `ISBN ${candidate.isbn}` : "No ISBN"}
                          </div>
                          {candidate.holdings && candidate.holdings.length > 0 ? (
                            <div className="mt-1 text-[11px] text-neutral-400">
                              {candidate.holdings
                                .map(
                                  (holding) =>
                                    `${holding.location_name} · ${holding.shelf_number} · qty ${holding.qty}`
                                )
                                .join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))
                )}
                {hasDbCandidates ? (
                  <button
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-left text-xs"
                    onClick={searchOnline}
                    disabled={ocrRunning}
                  >
                    Search Online
                  </button>
                ) : null}
                <button
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-left text-xs"
                  onClick={() => openAddBook(undefined)}
                >
                  Manual entry
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showHolding ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
            <h3 className="text-base font-semibold">Add Bookshelf</h3>
              <button className="text-xs text-neutral-500" onClick={closeHolding}>
                Close
              </button>
            </div>
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
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Add Book & Holding</h3>
              <button className="text-xs text-neutral-500" onClick={closeAddBook}>
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

      {showCameraModal ? (
        <div className="fixed inset-0 z-50 bg-black">
          <video
            ref={cameraModalRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute rounded-2xl border-2 border-white/80 shadow-[0_0_0_200vmax_rgba(0,0,0,0.35)]"
              style={getCropBoxStyle()}
            />
          </div>
          <button
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-2 text-xs text-neutral-700"
            onClick={stopOcrCamera}
          >
            Close
          </button>
          <button
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white px-6 py-3 text-sm font-semibold shadow-lg"
            onClick={captureOcrFrame}
            disabled={!ocrStream || ocrRunning}
          >
            Capture
          </button>
        </div>
      ) : null}
      {showDbDetail && selectedCandidate ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">{selectedCandidate.title}</h3>
                <p className="text-xs text-neutral-500">{selectedCandidate.author}</p>
              </div>
              <button className="text-xs text-neutral-500" onClick={closeDbDetail}>
                Close
              </button>
            </div>
            <div className="mt-3 text-xs text-neutral-500">
              {selectedCandidate.isbn ? `ISBN ${selectedCandidate.isbn}` : "No ISBN"}
            </div>
            {selectedCandidate.holdings && selectedCandidate.holdings.length > 0 ? (
              <div className="mt-4 space-y-2 text-xs">
                {selectedCandidate.holdings.map((holding) => (
                  <div
                    key={`${holding.id}-${holding.location_id}`}
                    className="rounded-lg border border-neutral-200 px-3 py-2"
                  >
                    {holding.location_name} · {holding.shelf_number} · qty {holding.qty}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-neutral-500">No holdings yet.</p>
            )}
            <div className="mt-4 flex justify-end">
                <button
                  className="rounded-lg bg-black px-3 py-2 text-xs text-white"
                  onClick={openHoldingFromDetail}
                >
                  Add Bookshelf
                </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
