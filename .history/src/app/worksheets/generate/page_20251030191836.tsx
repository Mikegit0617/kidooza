'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

function base64ToBlobUrl(b64: string, mime = 'application/pdf') {
  const byteChars = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

type Lang = 'en' | 'es' | 'vi';
type Diff = 'Easy' | 'Medium' | 'Hard';

const STORAGE_KEY = 'kidooza.generate.settings';

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const l = (navigator.language || navigator.languages?.[0] || 'en').toLowerCase();
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('vi')) return 'vi';
  return 'en';
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default function GenerateWorksheetPage() {
  // ----- core fields
  const [subject, setSubject] = useState('Math');
  const [grade, setGrade] = useState<number>(3);
  const [difficulty, setDifficulty] = useState<Diff>('Easy');
  const [count, setCount] = useState<number>(10);
  const [teacher, setTeacher] = useState('');
  const [student, setStudent] = useState('');
  const [language, setLanguage] = useState<Lang>('en');

  // work lines
  const [showWorkLines, setShowWorkLines] = useState(true);
  const [linesPerQuestion, setLinesPerQuestion] = useState<number>(2);

  // loading
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);

  // answer key url (not rendered, used to revoke)
  const keyUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (keyUrlRef.current) URL.revokeObjectURL(keyUrlRef.current); }, []);

  // ----- load from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setSubject(saved.subject ?? 'Math');
        setGrade(clamp(saved.grade ?? 3, 1, 12));
        setDifficulty((saved.difficulty as Diff) ?? 'Easy');
        setCount(clamp(saved.count ?? 10, 1, 120));
        setTeacher(saved.teacher ?? '');
        setStudent(saved.student ?? '');
        setLanguage((saved.language as Lang) ?? detectLang());
        setShowWorkLines(typeof saved.showWorkLines === 'boolean' ? saved.showWorkLines : (String(saved.subject ?? '').toLowerCase() === 'math'));
        setLinesPerQuestion(clamp(saved.linesPerQuestion ?? (String(saved.subject ?? '').toLowerCase() === 'math' ? 2 : 0), 0, 5));
      } else {
        // no saved prefs → choose smart defaults
        setLanguage(detectLang());
        if (subject.toLowerCase() === 'math') {
          setShowWorkLines(true);
          setLinesPerQuestion(2);
        } else {
          setShowWorkLines(false);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- smart subject defaults (do not override if user explicitly set)
  useEffect(() => {
    if (subject.toLowerCase() === 'math') {
      setShowWorkLines((v) => v ?? true);
      setLinesPerQuestion((v) => (v === 0 ? 2 : v));
    } else {
      setShowWorkLines(false);
    }
  }, [subject]);

  // ----- persist to localStorage (debounced)
  const saveTimeout = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          subject, grade, difficulty, count, teacher, student,
          language, showWorkLines, linesPerQuestion
        }));
      } catch { /* ignore */ }
    }, 250);
    return () => { if (saveTimeout.current) window.clearTimeout(saveTimeout.current); };
  }, [subject, grade, difficulty, count, teacher, student, language, showWorkLines, linesPerQuestion]);

  // ----- validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (grade < 1 || grade > 12) e.grade = 'Grade must be between 1 and 12.';
    if (count < 1 || count > 120) e.count = 'Count must be between 1 and 120.';
    if (linesPerQuestion < 0 || linesPerQuestion > 5) e.lines = 'Lines per question must be 0–5.';
    return e;
  }, [grade, count, linesPerQuestion]);

  const hasErrors = Object.keys(errors).length > 0;

  // ----- actions
  async function openStudentPdf() {
    try {
      setLoadingStudent(true);
      const res = await fetch('/api/worksheets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          grade: clamp(grade, 1, 12),
          difficulty,
          count: clamp(count, 1, 120),
          teacher,
          student,
          language,
          showWorkLines,
          linesPerQuestion: clamp(linesPerQuestion, 0, 5),
        }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      alert('Failed to generate worksheet PDF.');
    } finally {
      setLoadingStudent(false);
    }
  }

  async function openAnswerKeyPdf() {
    try {
      setLoadingKey(true);
      const res = await fetch('/api/worksheets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          subject,
          grade: clamp(grade, 1, 12),
          difficulty,
          count: clamp(count, 1, 120),
          teacher,
          student,
          includeAnswerKey: true,
          language,
          showWorkLines,
          linesPerQuestion: clamp(linesPerQuestion, 0, 5),
        }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (!data?.answerKey) throw new Error('Missing answerKey in response');

      if (keyUrlRef.current) URL.revokeObjectURL(keyUrlRef.current);
      const href = base64ToBlobUrl(data.answerKey);
      keyUrlRef.current = href;
      window.open(href, '_blank');
    } catch (e) {
      console.error(e);
      alert('Failed to open Answer Key PDF.');
    } finally {
      setLoadingKey(false);
    }
  }

  // ----- styles
  const inputCls =
    'border rounded-lg px-3 py-2 text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200';
  const labelCls = 'text-sm font-medium text-slate-700';

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <header className="mb-5">
          <h1 className="text-3xl font-semibold text-slate-800 tracking-tight">Generate Worksheet</h1>
          <p className="text-slate-600 mt-1">
            Create a polished two-column student worksheet and an answer key. Add optional work lines, choose
            language, and set difficulty.
          </p>
        </header>

        {/* Card */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6">
          {/* Grid form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Subject */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Subject</label>
              <select className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option>Math</option>
                <option>Reading</option>
                <option>Science</option>
                <option>History</option>
                <option>Geography</option>
                <option>Animals</option>
                <option>Art</option>
                <option>Language</option>
              </select>
            </div>

            {/* Grade */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Grade</label>
              <input
                type="number"
                className={inputCls}
                value={grade}
                onChange={(e) => setGrade(clamp(parseInt(e.target.value || '0', 10), 0, 99))}
                min={1}
                max={12}
                aria-invalid={!!errors.grade}
              />
              {errors.grade && <p className="text-xs text-red-600">{errors.grade}</p>}
            </div>

            {/* Difficulty */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Difficulty</label>
              <select className={inputCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Diff)}>
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </div>

            {/* Count */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Count</label>
              <input
                type="number"
                className={inputCls}
                value={count}
                onChange={(e) => setCount(clamp(parseInt(e.target.value || '0', 10), 0, 999))}
                min={1}
                max={120}
                aria-invalid={!!errors.count}
              />
              {errors.count && <p className="text-xs text-red-600">{errors.count}</p>}
            </div>

            {/* Teacher */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Teacher</label>
              <input
                type="text"
                className={inputCls}
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              />
            </div>

            {/* Student */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Student</label>
              <input
                type="text"
                className={inputCls}
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              />
            </div>

            {/* Language */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Language</label>
              <select
                className={inputCls}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Lang)}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </div>

            {/* Work lines toggle */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Show work lines</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowWorkLines((v) => !v)}
                  className={
                    'relative inline-flex h-6 w-11 items-center rounded-full transition shadow-sm ' +
                    (showWorkLines ? 'bg-blue-600' : 'bg-slate-300')
                  }
                  aria-pressed={showWorkLines}
                >
                  <span
                    className={
                      'inline-block h-5 w-5 transform rounded-full bg-white transition ' +
                      (showWorkLines ? 'translate-x-5' : 'translate-x-1')
                    }
                  />
                </button>
                <span className="text-sm text-slate-600">
                  {showWorkLines ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Lines per question */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label className={labelCls}>Lines per question</label>
                <span className="text-xs text-slate-500">0–5</span>
              </div>
              <input
                type="number"
                className={inputCls + (showWorkLines ? '' : ' opacity-60')}
                value={linesPerQuestion}
                onChange={(e) => setLinesPerQuestion(clamp(parseInt(e.target.value || '0', 10), 0, 5))}
                min={0}
                max={5}
                disabled={!showWorkLines}
                aria-invalid={!!errors.lines}
              />
              {errors.lines && <p className="text-xs text-red-600">{errors.lines}</p>}
              <p className="text-xs text-slate-500">
                Always includes a thin answer line; additional lines appear when enabled.
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px bg-slate-200" />

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openStudentPdf}
              disabled={loadingStudent || hasErrors}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700 disabled:opacity-60"
            >
              {loadingStudent ? 'Generating…' : 'Generate PDF (Student)'}
            </button>
            <button
              onClick={openAnswerKeyPdf}
              disabled={loadingKey || hasErrors}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-700 disabled:opacity-60"
              title="Opens only the Answer Key PDF in a new tab"
            >
              {loadingKey ? 'Opening…' : 'Open Answer Key PDF'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
