"use client";

/**
 * KIDOOZA — Quiz v3.9.4 (DEV)
 * - Faster handoff: TTS → mic opens almost immediately
 * - Softer voices: interimResults + maxAlternatives + soft auto-retry
 * - Removed "disable while running": buttons always responsive
 * - Run token cancels in-flight reads (prevents double speak/listen without disabling UI)
 * - Localized prompt ends with exactly one '?' (no '?.?' etc.)
 * - Accepts filler speech like "it is twelve", "equals twelve", "= 12" (EN/ES/VI)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------------- Mini Modal (inline) ---------------- */
function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,.15)",
          minWidth: 280,
          maxWidth: 440,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- Mini StarBank (inline) ---------------- */
type KZBadge = { id: string; label: string; emoji?: string };
function StarBank({
  stars,
  onSpend,
}: {
  stars: number;
  onSpend?: (n: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        border: "1px solid #e5e7eb",
        padding: "8px 10px",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      <span style={{ fontWeight: 700 }}>⭐ {stars}</span>
      <button
        onClick={() => onSpend?.(1)}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f8fafc",
          cursor: "pointer",
        }}
      >
        Spend 1
      </button>
    </div>
  );
}

/* ---------------- Types ---------------- */
type LangCode = "en" | "es" | "vi";
type QA = { q: string; a: string | number };
type CheckResult =
  | { status: "correct"; heard: string }
  | { status: "incorrect"; heard: string; hint?: string };
type Difficulty = "easy" | "medium" | "hard";
type Operation = "add" | "sub" | "mul" | "div";

/* ---------------- Demo defaults ---------------- */
const DEFAULT_COUNT = 8;

/* ---------------- Generic utils ---------------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t = (s: string) => s; // placeholder i18n passthrough

function readablePrompt(raw: string): string {
  // Prevent underscore spam; normalize to “blank”
  return (raw || "").replace(/_{2,}|blank|___/gi, "blank");
}

/* ---------- Accent-insensitive normalization for VI ---------- */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function normalizeFor(text: string, lang: LangCode): string {
  let out = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
  out = out.replace(/[^\p{L}\p{N}\s\.\-=]/gu, ""); // keep '=' too
  if (lang === "vi") out = stripDiacritics(out);
  return out;
}

/* ---------- Filler stripper (accept "it is twelve", "equals 12", "= 12") ---------- */
function stripFiller(text: string, lang: LangCode): string {
  let s = normalizeFor(text, lang);

  // Common cross-language symbols
  s = s.replace(/^\s*=\s*/g, ""); // remove leading equals sign

  if (lang === "vi") {
    s = s
      .replace(/\b(là|dap an la|ket qua la)\b/gi, "")
      .replace(/\bso\b/gi, ""); // “số”
  } else if (lang === "es") {
    s = s
      .replace(/\b(es|la respuesta es|resultado es|son)\b/gi, "")
      .replace(/\bel\b/gi, "");
  } else {
    s = s
      .replace(/\b(it is|it’s|equals|the answer is|answer is|is)\b/gi, "")
      .replace(/\bnumber\b/gi, "");
  }

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/* ---------- Number words + parsing ---------- */
function numberWords(lang: LangCode): Record<string, number> {
  if (lang === "es") {
    return {
      cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
      ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
      quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
    };
  }
  if (lang === "vi") {
    // keys are accentless (we strip accents before compare)
    return {
      khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10,
      "muoi mot": 11, "muoi hai": 12, "muoi ba": 13, "muoi bon": 14, "muoi lam": 15,
      "muoi sau": 16, "muoi bay": 17, "muoi tam": 18, "muoi chin": 19, "hai muoi": 20,
    };
  }
  return {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };
}

function parseNumberFromSpeech(text: string, lang: LangCode): number | null {
  if (!text) return null;

  // allow filler phrases and symbols like '='
  const cleaned = stripFiller(text, lang);

  // Zero homophones (EN): accept 'oh', 'o', 'nil', 'naught', 'nothing'
  if (lang === "en") {
    const zWords = ["oh", "o", "nil", "naught", "nothing", "zero"];
    for (const w of zWords) {
      if ((" " + cleaned + " ").includes(" " + w + " ")) return 0;
    }
  }

  // If digits present, prefer numeric parse
  const numeric = cleaned.replace(/[^\d\.\-]/g, "");
  if (/\d/.test(numeric)) {
    const n = Number(numeric);
    if (!Number.isNaN(n)) return n;
  }

  // Exact match of whole phrase
  const map = numberWords(lang);
  const norm = normalizeFor(cleaned, lang);
  if (map[norm] !== undefined) return map[norm];

  // Substring fallback: “es doce”, “muoi  hai”, etc.
  for (const [k, v] of Object.entries(map)) {
    if (norm.includes(k)) return v;
  }
  return null;
}

/* ---------- Localization for spoken strings ---------- */
function L(
  key: "listen" | "correct" | "try_again" | "lead_in" | "your_turn",
  lang: LangCode
): string {
  if (lang === "vi") {
    switch (key) {
      case "listen": return "Hãy lắng nghe cẩn thận.";
      case "correct": return "Đúng rồi!";
      case "try_again": return "Thử lại.";
      case "lead_in": return "Đọc câu hỏi:";
      case "your_turn": return "Đến lượt bạn.";
    }
  }
  if (lang === "es") {
    switch (key) {
      case "listen": return "Escucha con atención.";
      case "correct": return "¡Correcto!";
      case "try_again": return "Intenta otra vez.";
      case "lead_in": return "Lee la pregunta:";
      case "your_turn": return "Tu turno.";
    }
  }
  switch (key) {
    case "listen": return "Listen carefully.";
    case "correct": return "Correct!";
    case "try_again": return "Try again.";
    case "lead_in": return "Read question:";
    case "your_turn": return "Your turn.";
  }
}

/* Localize the visible/spoken math prompt + normalize to one trailing '?' */
function localizePrompt(raw: string, lang: LangCode): string {
  let s = readablePrompt(raw).trim();

  if (lang === "vi") {
    s = s
      .replace(/\bplus\b/gi, "cộng")
      .replace(/\bminus\b/gi, "trừ")
      .replace(/\btimes\b|\bmultiply(?:ied)?\s+by\b/gi, "nhân")
      .replace(/\bdivided\s+by\b/gi, "chia cho")
      .replace(/\bequals\s+blank\b/gi, "bằng mấy")
      .replace(/\bequals\b(?!\s*bằng mấy\??)/gi, "bằng mấy")
      .replace(/\bblank\b/gi, "chỗ trống");
  } else if (lang === "es") {
    s = s
      .replace(/\bplus\b/gi, "más")
      .replace(/\bminus\b/gi, "menos")
      .replace(/\btimes\b|\bmultiply(?:ied)?\s+by\b/gi, "por")
      .replace(/\bdivided\s+by\b/gi, "dividido entre")
      .replace(/\bequals\s+blank\b/gi, "¿cuánto es")
      .replace(/\bequals\b(?!\s*¿cuánto es\??)/gi, "¿cuánto es")
      .replace(/\bblank\b/gi, "espacio en blanco");
  } else {
    s = s
      .replace(/\bequals\s+blank\b/gi, "equals what")
      .replace(/\bequals\b(?!\s*what\??)/gi, "equals what")
      .replace(/\bblank\b/gi, "blank");
  }
  s = s.replace(/[.!?]+\s*$/u, "").trim() + "?";
  return s;
}

/* ---------------- Speech helpers ---------------- */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) resolve(v);
      else setTimeout(load, 120);
    };
    load();
  });
}

function chooseVoice(
  lang: LangCode,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const preferredNames =
    lang === "vi"
      ? [
          "Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)",
          "Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)",
          "Google tiếng Việt",
          "Google Vietnamese",
        ]
      : lang === "es"
      ? ["Google español", "Microsoft Dalia Online (Natural) - Spanish (Spain)"]
      : ["Google US English", "Microsoft Aria Online (Natural) - English (United States)"];

  for (const name of preferredNames) {
    const v = voices.find((vv) => vv.name === name);
    if (v) return v;
  }

  const wantPrefix = lang === "vi" ? "vi-" : lang === "es" ? "es-" : "en-";
  const langMatch = voices.find((v) => (v.lang || "").toLowerCase().startsWith(wantPrefix));
  if (langMatch) return langMatch;

  return voices[0] ?? null;
}

async function speakAsync(text: string, lang: LangCode, rate = 1): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      window.speechSynthesis.cancel();
      const voices = await voicesReady();
      const u = new SpeechSynthesisUtterance(text);
      const v = chooseVoice(lang, voices);
      if (v) u.voice = v;
      u.lang = v?.lang ?? (lang === "vi" ? "vi-VN" : lang === "es" ? "es-ES" : "en-US");
      u.rate = lang === "vi" ? Math.min(rate, 1) * 0.95 : rate; // slightly slower for VI
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

/* Web Speech recognition (with better tolerance for soft/short speech) */
function getRec(): SpeechRecognition | null {
  const SR: any =
    (globalThis as any).SpeechRecognition ||
    (globalThis as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec: SpeechRecognition = new SR();
  rec.continuous = false;
  rec.interimResults = true;   // allow partials
  rec.maxAlternatives = 3;     // try a few guesses
  return rec;
}

async function startListeningOnce(lang: LangCode, setListening: (b: boolean) => void, recRef: React.MutableRefObject<SpeechRecognition | null>): Promise<string | null> {
  const SR = getRec();
  if (!SR) {
    console.warn("SpeechRecognition not available");
    return null;
  }
  try {
    recRef.current?.abort();
    recRef.current?.stop();
  } catch {}
  recRef.current = SR;

  return new Promise((resolve) => {
    let resolved = false;
    let lastPartial = "";

    SR.lang = lang === "vi" ? "vi-VN" : lang === "es" ? "es-ES" : "en-US";

    const done = (text: string | null) => {
      if (resolved) return;
      resolved = true;
      try {
        recRef.current?.abort();
        recRef.current?.stop();
      } catch {}
      setListening(false);
      resolve(text);
    };

    SR.onresult = (e: SpeechRecognitionEvent) => {
      const res = e.results?.[e.results.length - 1];
      if (!res) return;
      const alt = res[0];
      const text = (alt?.transcript ?? "").toString();

      if (res.isFinal) {
        done(text);
      } else {
        lastPartial = text;
      }
    };

    SR.onend = () => {
      if (!resolved) {
        done(lastPartial || null);
      }
    };

    SR.onerror = () => done(null);

    setListening(true);
    try {
      SR.start();
    } catch {
      done(null);
    }
  });
}

/* ---------------- RNG + Question generation ---------------- */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function boundsFor(gradeLevel: number, difficulty: Difficulty, op: Operation) {
  const base = {
    add: [5, 10, 20],
    sub: [5, 10, 20],
    mul: [3, 7, 12],
    div: [3, 7, 12],
  }[op];

  const gradeBoost = Math.max(0, gradeLevel - 1);
  const baseMax = base[difficulty === "easy" ? 0 : difficulty === "medium" ? 1 : 2] + gradeBoost * 3;

  const maxA = op === "div" ? Math.max(5, baseMax) : baseMax + 5;
  const maxB = op === "div" ? Math.max(2, Math.min(10, baseMax)) : maxA;

  return { maxA, maxB };
}

function makeOne(op: Operation, gradeLevel: number, difficulty: Difficulty): QA {
  const { maxA, maxB } = boundsFor(gradeLevel, difficulty, op);

  if (op === "add") {
    const a = randInt(0, maxA);
    const b = randInt(0, maxB);
    return { q: `${a} plus ${b} equals blank.`, a: a + b };
  }
  if (op === "sub") {
    let a = randInt(0, maxA);
    let b = randInt(0, maxB);
    if (b > a) [a, b] = [b, a];
    return { q: `${a} minus ${b} equals blank.`, a: a - b };
  }
  if (op === "mul") {
    const a = randInt(0, maxA);
    const b = randInt(0, maxB);
    return { q: `${a} times ${b} equals blank.`, a: a * b };
  }
  let b = randInt(1, maxB);
  const ans = randInt(1, Math.max(2, Math.floor(maxA / b)));
  const a = ans * b;
  return { q: `${a} divided by ${b} equals blank.`, a: ans };
}

function generateSet(
  ops: Operation[],
  gradeLevel: number,
  difficulty: Difficulty,
  count: number
): QA[] {
  const items: QA[] = [];
  for (let i = 0; i < count; i++) {
    const op = ops[i % ops.length];
    items.push(makeOne(op, gradeLevel, difficulty));
  }
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/* ---------------- Local storage: per-student save ---------------- */
const STORAGE_PREFIX = "kidooza:quiz:v3.9";
type SavedState = {
  index: number;
  streak: number;
  stars: number;
  grade: number;
  difficulty: Difficulty;
  ops: Operation[];
  count: number;
};

function loadState(studentId: string): SavedState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${studentId}`);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}
function saveState(studentId: string, s: SavedState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${studentId}`, JSON.stringify(s));
  } catch {}
}

/* ---------------- Page ---------------- */
export default function QuizPage() {
  const [lang, setLang] = useState<LangCode>("en");

  // Controls
  const [studentId, setStudentId] = useState<string>("student-1");
  const [grade, setGrade] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [ops, setOps] = useState<Operation[]>(["add"]);
  const [count, setCount] = useState<number>(DEFAULT_COUNT);

  // Items & progress
  const [items, setItems] = useState<QA[]>(() =>
    generateSet(ops, grade, difficulty, count)
  );
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [stars, setStars] = useState(0);
  const [badge, setBadge] = useState<KZBadge | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [listening, setListening] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [chip, setChip] = useState<{ text: string } | null>(null); // answer chip

  const total = items.length;
  const done = index >= total;
  const current = useMemo(() => items[index] ?? null, [items, index]);

  /* Refs that drive the flow (no stale state) */
  const indexRef = useRef(0);
  const recRef = useRef<SpeechRecognition | null>(null);
  const canceledRef = useRef(false);
  const runRef = useRef(0); // increments to invalidate any in-flight read

  /* keep indexRef in sync */
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Load saved state on student switch
  useEffect(() => {
    const saved = loadState(studentId);
    if (saved) {
      setGrade(saved.grade);
      setDifficulty(saved.difficulty);
      setOps(saved.ops);
      setCount(saved.count);
      const newItems = generateSet(saved.ops, saved.grade, saved.difficulty, saved.count);
      setItems(newItems);
      setIndex(Math.min(saved.index, newItems.length));
      setStreak(saved.streak);
      setStars(saved.stars);
    } else {
      const newItems = generateSet(ops, grade, difficulty, count);
      setItems(newItems);
      setIndex(0);
      setStreak(0);
      setStars(0);
    }
    onStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Persist on key changes / progress
  useEffect(() => {
    saveState(studentId, {
      index,
      streak,
      stars,
      grade,
      difficulty,
      ops,
      count,
    });
  }, [studentId, index, streak, stars, grade, difficulty, ops, count]);

  // On mount: make sure TTS cancelled and clean up STT
  useEffect(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild a fresh randomized set whenever controls change
  useEffect(() => {
    const next = generateSet(ops, grade, difficulty, count);
    setItems(next);
    setIndex(0);
    indexRef.current = 0;
    setChip(null);
    setShowCongrats(false);
    onStop(); // cancel any TTS/STT in flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, grade, difficulty, count]);

  function stopListening() {
    try {
      recRef.current?.abort();
      recRef.current?.stop();
    } catch {}
    setListening(false);
  }

  /* ====== index- & run-parameterized flow ====== */
  async function readAt(i: number, run: number) {
    if (run !== runRef.current || i !== indexRef.current || i >= total) return;

    stopListening();
    try {
      window.speechSynthesis.cancel();
    } catch {}

    const prompt = localizePrompt(items[i]?.q ?? "", lang);

    if (!quiet) {
      await speakAsync(L("lead_in", lang), lang, 1);
      if (run !== runRef.current || i !== indexRef.current) return;

      await speakAsync(prompt, lang, 1);
      if (run !== runRef.current || i !== indexRef.current) return;

      await speakAsync(L("your_turn", lang), lang, 1);
      if (run !== runRef.current || i !== indexRef.current) return;

      // Short settle to avoid mic catching tail of TTS
      await sleep(120);
    }

    let heard = await startListeningOnce(lang, setListening, recRef);
    if (run !== runRef.current || i !== indexRef.current) return;

    // Soft auto-retry when silence / too soft
    if (!heard) {
      await sleep(120);
      heard = await startListeningOnce(lang, setListening, recRef);
      if (run !== runRef.current || i !== indexRef.current) return;
    }

    const result = gradeAnswer(i, heard);
    await giveFeedback(result);
    if (run !== runRef.current || i !== indexRef.current) return;

    if (result.status === "correct") {
      const base = 1;
      const bonus = difficulty === "hard" ? 2 : difficulty === "medium" ? 1 : 0;
      const addStars = base + bonus;
      showAnswerChip(`${items[i]?.a}  (+${addStars}⭐)`);

      const next = i + 1;
      setIndex(next);
      setStreak((s) => s + 1);
      setStars((s) => s + addStars);
      if (streak + 1 === 3) setBadge({ id: "streak3", label: "3-Streak!", emoji: "🔥" });

      if (next >= total) {
        setShowCongrats(true);
        return;
      }
      await sleep(220);
      readAt(next, run);
      return;
    }

    await sleep(160);
    retryAt(i, run);
  }

  async function retryAt(i: number, run: number) {
    if (run !== runRef.current || i !== indexRef.current || i >= total) return;

    let heard = await startListeningOnce(lang, setListening, recRef);
    if (run !== runRef.current || i !== indexRef.current) return;

    if (!heard) {
      await sleep(120);
      heard = await startListeningOnce(lang, setListening, recRef);
      if (run !== runRef.current || i !== indexRef.current) return;
    }

    const result = gradeAnswer(i, heard);
    await giveFeedback(result);
    if (run !== runRef.current || i !== indexRef.current) return;

    if (result.status === "correct") {
      const base = 1;
      const bonus = difficulty === "hard" ? 2 : difficulty === "medium" ? 1 : 0;
      const addStars = base + bonus;
      showAnswerChip(`${items[i]?.a}  (+${addStars}⭐)`);

      const next = i + 1;
      setIndex(next);
      setStreak((s) => s + 1);
      setStars((s) => s + addStars);
      if (streak + 1 === 3) setBadge({ id: "streak3", label: "3-Streak!", emoji: "🔥" });

      if (next >= total) {
        setShowCongrats(true);
        return;
      }
      await sleep(200);
      readAt(next, run);
      return;
    }

    await sleep(140);
    retryAt(i, run);
  }

  /* ====== Grading / feedback (explicit index) ====== */
  function gradeAnswer(i: number, heardRaw: string | null): CheckResult {
    const expected = normalizeFor(String(items[i]?.a ?? ""), lang);
    const heard = normalizeFor(String(heardRaw ?? ""), lang);

    const heardNum = parseNumberFromSpeech(heard, lang);
    if (heardNum !== null && expected === normalizeFor(String(heardNum), lang)) {
      return { status: "correct", heard };
    }
    if (heard && heard === expected) {
      return { status: "correct", heard };
    }
    return { status: "incorrect", heard, hint: t("Try again.") };
  }

  async function giveFeedback(result: CheckResult) {
    if (quiet) return;
    if (result.status === "correct") await speakAsync(L("correct", lang), lang, 1);
    else await speakAsync(L("try_again", lang), lang, 1);
  }

  /* ---------- UI actions ---------- */
  function onManualRead() {
    onStop(); // cancel any in-flight run
    const myRun = ++runRef.current;
    canceledRef.current = false;
    readAt(indexRef.current, myRun);
  }
  function onReset() {
    onStop();
    setIndex(0);
    indexRef.current = 0;
    setStreak(0);
    setStars(0);
    setBadge(null);
    setChip(null);
  }
  function onStop() {
    canceledRef.current = true;
    runRef.current++; // invalidate any in-flight read immediately
    stopListening();
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  function onRegenerate() {
    const next = generateSet(ops, grade, difficulty, count);
    setItems(next);
    setIndex(0);
    indexRef.current = 0;
    setStreak(0);
    setChip(null);
    setShowCongrats(false);
    onStop(); // also invalidates the run
  }

  function toggleOp(op: Operation) {
    setOps((prev) => {
      const has = prev.includes(op);
      const next = has ? prev.filter((o) => o !== op) : [...prev, op];
      return next.length === 0 ? ["add"] : next;
    });
  }

  function showAnswerChip(text: string) {
    setChip({ text });
    setTimeout(() => setChip(null), 1400);
  }

  /* ------ small UI helpers ------ */
  const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 10px 30px rgba(2,6,23,.06)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );

  /* ------ Render ------ */
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px" }}>
      {/* DEV banner so you know this page doesn't touch /quiz */}
      <div
        style={{
          display: "inline-block",
          textAlign: "center",
          marginBottom: 8,
          color: "#92400e",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          boxShadow: "0 1px 0 rgba(0,0,0,.02)",
          padding: "6px 10px",
          borderRadius: 8,
        }}
        title="This page is a safe sandbox. Changes here do not affect /quiz."
      >
        <strong>DEV SANDBOX</strong> — changes here will <u>NOT</u> affect <code>/quiz</code>.
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1
          style={{
            textAlign: "center",
            fontWeight: 800,
            fontSize: 28,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          KIDOOZA — Quiz
        </h1>
        <p
          style={{
            textAlign: "center",
            marginTop: 6,
            marginBottom: 0,
            color: "#64748b",
          }}
        >
          {t("Auto-read, listen, and learn.")}
        </p>
      </header>

      {/* Controls */}
      <Card>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              {t("Student ID")}{" "}
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value || "student-1")}
                placeholder="student-1"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  width: "100%",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label>
                {t("Language")}:{" "}
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as LangCode)}
                >
                  <option value="en">EN</option>
                  <option value="es">ES</option>
                  <option value="vi">VI</option>
                </select>
              </label>

              <label>
                {t("Grade")}:{" "}
                <select
                  value={String(grade)}
                  onChange={(e) => setGrade(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((g) => (
                    <option key={g} value={String(g)}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t("Difficulty")}:{" "}
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">{t("Easy")}</option>
                  <option value="medium">{t("Medium")}</option>
                  <option value="hard">{t("Hard")}</option>
                </select>
              </label>

              <label>
                {t("Count")}:{" "}
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={count}
                  onChange={(e) =>
                    setCount(
                      Math.min(40, Math.max(4, Number(e.target.value) || DEFAULT_COUNT))
                    )
                  }
                  style={{
                    width: 80,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {([
                ["add", "Addition (+)"],
                ["sub", "Subtraction (−)"],
                ["mul", "Multiplication (×)"],
                ["div", "Division (÷)"],
              ] as const).map(([k, label]) => {
                const op = k as Operation;
                const active = ops.includes(op);
                return (
                  <button
                    key={k}
                    onClick={() => toggleOp(op)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
                      background: active ? "#ecf3ff" : "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    {active ? "✅ " : "☐ "} {t(label)}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={quiet}
                onChange={(e) => setQuiet(e.target.checked)}
              />
              {t("Quiet mode (no TTS)")}
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onManualRead}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #dbe3ef",
                  background: "#ecf3ff",
                  cursor: "pointer",
                }}
              >
                🔊 {t("Read Question")}
              </button>
              <button
                onClick={onStop}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #fee2e2",
                  background: "#fff1f2",
                  cursor: "pointer",
                }}
              >
                ⏸ {t("Stop")}
              </button>
              <button
                onClick={onReset}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  cursor: "pointer",
                }}
              >
                ♻️ {t("Reset Quiz")}
              </button>
              <button
                onClick={onRegenerate}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
                title="Create a fresh randomized set using current options"
              >
                🎲 {t("Regenerate Set")}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Question + Chip */}
      <Card>
        {!done ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 14, color: "#64748b" }}>
                {t("Question")} {index + 1}/{total}
              </div>
              <div style={{ fontSize: 14, color: "#64748b" }}>
                {t("Listening")}: {listening ? "🟢" : "⚪"}
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>
                {localizePrompt(current?.q ?? "", lang)}
              </div>

              {/* Answer Chip */}
              {chip && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: -6,
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    color: "#065f46",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontWeight: 700,
                    opacity: 1,
                    transition: "opacity 0.8s ease 0.4s",
                  }}
                >
                  {chip.text}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={onManualRead}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #dbe3ef",
                  background: "#ecf3ff",
                  cursor: "pointer",
                }}
              >
                ▶️ {t("Start / Re-read & Listen")}
              </button>

              <button
                onClick={onStop}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #fee2e2",
                  background: "#fff1f2",
                  cursor: "pointer",
                }}
              >
                ⏸ {t("Stop")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
              {t("All done!")}
            </div>
            <p style={{ marginTop: 0, color: "#64748b" }}>
              {t("Great work—want to try again?")}
            </p>
            <button
              onClick={onReset}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ♻️ {t("Restart")}
            </button>
            <button
              onClick={() => {}}
              style={{
                marginLeft: 8,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #dbe3ef",
                background: "#ecf3ff",
                cursor: "pointer",
              }}
            >
              ✅ {t("Close")}
            </button>
          </>
        )}
      </Card>

      {/* Progress + StarBank */}
      <Card>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, color: "#64748b" }}>{t("Streak")}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{streak}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, color: "#64748b" }}>{t("Stars")}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{stars} ⭐</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <StarBank
              stars={stars}
              onSpend={(n: number) => setStars((s) => Math.max(0, s - n))}
            />
          </div>
        </div>
        {badge && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              background: "#f0f9ff",
              border: "1px solid #dbeafe",
            }}
          >
            {badge.emoji} <strong>{badge.label}</strong>
          </div>
        )}
      </Card>

      <Modal open={showCongrats} onClose={() => setShowCongrats(false)}>
        <div style={{ padding: 8 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>{t("Amazing!")}</h2>
          <p style={{ marginTop: 0 }}>
            {t("You finished all questions. Want to go again?")}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setShowCongrats(false);
                onReset();
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ♻️ {t("Restart")}
            </button>
            <button
              onClick={() => setShowCongrats(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #dbe3ef",
                background: "#ecf3ff",
                cursor: "pointer",
              }}
            >
              ✅ {t("Close")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
