"use client";
/// <reference types="dom-speech-recognition" />

import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * KIDOOZA — Voice Quiz (Loop Until Correct) + Live Worksheet Data
 * - Reads question → auto-listens until a final result
 * - Wrong → “Try again.” then resumes listening
 * - Right → “Correct!” and stops (Next to continue)
 * - Loads items from /api/worksheets/generate?mode=json
 *   (falls back to POST JSON if GET returns PDF or non-JSON)
 */

type RawItem = any;
type QA = { id?: string | number; q: string; a: string | number };

/* ---------- Normalize various item shapes into { q, a } ---------- */
function toQA(x: RawItem): QA | null {
  if (!x) return null;
  const q = x.question ?? x.q ?? x.prompt ?? x.text ?? x.title ?? null;
  const a = x.answer ?? x.a ?? x.solution ?? x.expected ?? x.result ?? null;
  if (q == null || a == null) return null;
  return { id: x.id ?? x._id ?? undefined, q: String(q), a };
}

/* ---------- Demo fallback if API is unavailable ---------- */
const DEMO: QA[] = [
  { q: "What is two plus three?", a: 5 },
  { q: "Spell the word 'cat'.", a: "cat" },
  { q: "What planet do we live on?", a: "earth" },
];

/* ---------- TTS helper ---------- */
function speak(
  text: string,
  opts?: Partial<SpeechSynthesisUtterance>,
  onend?: () => void
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onend?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (opts) Object.assign(u, opts);
  if (onend) u.onend = onend;
  window.speechSynthesis.speak(u);
}

/* ---------- Grading helpers ---------- */
function norm(x: unknown) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/[^\w$-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseNumberLike(s: string): number | null {
  const m = s.replace(/[^0-9.-]/g, "");
  if (!m || m === "-" || m === "." || m === "-.") return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

const WORD2NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function maybeWordNumber(s: string): number | null {
  const n = WORD2NUM[s.trim().toLowerCase()];
  return typeof n === "number" ? n : null;
}

function isCorrect(transcriptRaw: string, expectedRaw: string | number): boolean {
  const t = norm(transcriptRaw);
  const e = norm(expectedRaw);

  if (t === e) return true;
  if (t === e.replace(/^\$/, "")) return true;
  if (("$" + t) === e) return true;

  const tn = parseNumberLike(t);
  const en = parseNumberLike(e);
  if (tn !== null && en !== null && tn === en) return true;

  const tw = maybeWordNumber(t);
  if (tw !== null && en !== null && tw === en) return true;

  return false;
}

/* ========================= PAGE ========================= */
export default function Page() {
  const [items, setItems] = useState<QA[]>(DEMO);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [score, setScore] = useState(0);

  const recognitionRef = useRef<any>(null);
  const forceStopRef = useRef<boolean>(false);
  const waitingToResumeAfterFeedbackRef = useRef<boolean>(false);

  /* ---------- Load worksheet from API ---------- */
  const loadWorksheet = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Try GET JSON first
      let res = await fetch("/api/worksheets/generate?mode=json", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      // If not OK or not JSON (e.g., PDF), try POST JSON fallback
      if (
        !res.ok ||
        !res.headers.get("content-type")?.includes("application/json")
      ) {
        res = await fetch("/api/worksheets/generate?mode=json", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ limit: 10 }),
        });
      }

      const data = await res.json();
      const raw: RawItem[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
        ? (data as any).items
        : [];

      const normalized: QA[] = (raw.map(toQA).filter(Boolean) as QA[]) || [];

      if (normalized.length === 0) {
        setItems(DEMO);
        setLoadError("No items returned from API — using demo set.");
      } else {
        setItems(normalized);
      }

      // reset quiz state
      setIndex(0);
      setScore(0);
      setHeard("");
    } catch {
      setItems(DEMO);
      setLoadError("Failed to load API — using demo set.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorksheet();
  }, [loadWorksheet]);

  /* ---------- Init/refresh SpeechRecognition per question ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const Ctor =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (!Ctor) {
      console.warn("SpeechRecognition not supported in this browser.");
      return;
    }

    const recog: any = new Ctor();
    // Keep the stream open; evaluate final results only
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.lang = "en-US";

    recog.onstart = () => setListening(true);

    recog.onresult = (ev: any) => {
      // Only act on final result
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText = r[0].transcript;
      }
      if (!finalText) return;

      setHeard(finalText.trim());
      const expected = items[index]?.a;
      const ok = isCorrect(finalText, expected);

      // Pause recognition while we give audio feedback
      try { recog.stop(); } catch {}
      setListening(false);

      if (ok) {
        speak("Correct!", undefined, () => {
          waitingToResumeAfterFeedbackRef.current = false;
        });
        setScore((s) => s + 1);
      } else {
        // Wrong → “Try again.” → resume listening automatically
        waitingToResumeAfterFeedbackRef.current = true;
        speak(`You said: ${finalText}. Try again.`, undefined, () => {
          if (!forceStopRef.current && waitingToResumeAfterFeedbackRef.current) {
            startListening(); // resume loop
          }
        });
      }
    };

    recog.onnomatch = () => {
      // no speech recognized; onend will decide whether to restart
    };

    recog.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
      // let onend decide whether to resume
    };

    recog.onend = () => {
      // If we didn’t force stop and we’re not waiting for feedback,
      // auto-restart to keep waiting for an answer.
      if (!forceStopRef.current && !waitingToResumeAfterFeedbackRef.current) {
        setTimeout(() => {
          try { recog.start(); } catch {}
        }, 200);
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recog;
    return () => {
      try { recog.abort(); } catch {}
      recognitionRef.current = null;
    };
  }, [index, items]);

  /* ---------- Mic permission ---------- */
  const ensureMicAccess = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      alert("Please allow microphone access for this site.");
      return false;
    }
  }, []);

  /* ---------- Start/Resume listening ---------- */
  const startListening = useCallback(async () => {
    const recog: any = recognitionRef.current;
    if (!recog) {
      alert("SpeechRecognition is not supported in this browser.");
      return;
    }
    if (!(await ensureMicAccess())) return;

    setHeard("");
    forceStopRef.current = false;
    waitingToResumeAfterFeedbackRef.current = false;

    speak("Listening");
    try {
      recog.start();
    } catch (err) {
      console.warn("start() issue:", err);
    }
  }, [ensureMicAccess]);

  /* ---------- Read question → after TTS, auto-listen ---------- */
  const readQuestion = useCallback(async () => {
    if (!(await ensureMicAccess())) return;

    const q = items[index]?.q ?? "";
    speak(q, undefined, () => {
      startListening();
    });
  }, [index, items, ensureMicAccess, startListening]);

  /* ---------- Manual Answer (fallback) ---------- */
  const manualAnswer = useCallback(() => {
    startListening();
  }, [startListening]);

  /* ---------- Next question ---------- */
  const nextQuestion = useCallback(() => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort?.();
    forceStopRef.current = true;
    waitingToResumeAfterFeedbackRef.current = false;

    setHeard("");
    setListening(false);
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  /* ---------- Regenerate / Reload worksheet ---------- */
  const reload = useCallback(() => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort?.();
    forceStopRef.current = true;
    waitingToResumeAfterFeedbackRef.current = false;
    setHeard("");
    setListening(false);
    loadWorksheet();
  }, [loadWorksheet]);

  /* ---------- UI ---------- */
  const qa = items[index];

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <h1 className="text-2xl font-bold">KIDOOZA — Voice Quiz</h1>
        <div className="mt-4">Loading worksheet…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold">KIDOOZA — Voice Quiz</h1>

      {loadError && <div className="text-sm text-red-600">{loadError}</div>}

      <div className="flex items-center gap-3">
        <button onClick={reload} className="px-3 py-2 rounded border" aria-label="Reload">
          🔁 Regenerate Worksheet
        </button>
        <div className="text-sm opacity-70">
          {items.length} question{items.length !== 1 ? "s" : ""} loaded
        </div>
      </div>

      <div className="text-lg">
        <div className="font-semibold mb-2">Question:</div>
        <div>{qa?.q ?? "—"}</div>
      </div>

      <div className="flex gap-3 items-center">
        <button onClick={readQuestion} className="px-3 py-2 rounded border" aria-label="Read Question">
          🔊 Read Question
        </button>

        <button onClick={manualAnswer} className="px-3 py-2 rounded border" aria-label="Answer">
          {listening ? "🎙️ Listening…" : "🎤 Answer"}
        </button>

        <button onClick={nextQuestion} className="px-3 py-2 rounded border" aria-label="Next Question">
          ➡️ Next
        </button>
      </div>

      <div>
        <div className="font-semibold">Heard:</div>
        <div>{heard || "—"}</div>
      </div>

      <div className="mt-2">Score: {score} / {items.length || 1}</div>
    </div>
  );
}
