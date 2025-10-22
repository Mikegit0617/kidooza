// src/app/worksheets/generate/page.tsx
"use client";

import { useState } from "react";

export default function WorksheetGenerator() {
  const [subject, setSubject] = useState("Math");
  const [grade, setGrade] = useState<number>(3);
  const [difficulty, setDifficulty] = useState("Easy");
  const [language, setLanguage] = useState("en");
  const [count, setCount] = useState<number>(20);
  const [ops, setOps] = useState<string[]>(["+"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const clamp = (n: number, min: number, max: number) =>
    Math.min(Math.max(n, min), max);

  const toggleOp = (op: string) => {
    setOps((prev) =>
      prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]
    );
  };

  async function generatePdf() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/worksheets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          grade: clamp(Number.isFinite(grade) ? grade : 3, 1, 12),
          difficulty,
          language,
          count: clamp(Number.isFinite(count) ? count : 20, 5, 100),
          ops,
        }),
      });

      if (!res.ok) throw new Error(`Failed (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">KIDOOZA — Worksheet Generator</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">Subject</span>
          <select
            className="border rounded p-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option>Math</option>
            <option>Science</option>
            <option>Reading</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">Grade</span>
          <input
            className="border rounded p-2"
            type="number"
            min={1}
            max={12}
            value={grade}
            onChange={(e) =>
              setGrade(clamp(parseInt(e.target.value || "3", 10), 1, 12))
            }
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">Difficulty</span>
          <select
            className="border rounded p-2"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">Language</span>
          <select
            className="border rounded p-2"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="vi">Vietnamese</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700"># of Problems</span>
          <input
            className="border rounded p-2"
            type="number"
            min={5}
            max={100}
            value={count}
            onChange={(e) =>
              setCount(clamp(parseInt(e.target.value || "20", 10), 5, 100))
            }
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-gray-700">Operations</span>
          <div className="flex flex-wrap items-center gap-4">
            {["+", "-", "×", "÷"].map((op) => (
              <label key={op} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={ops.includes(op)}
                  onChange={() => toggleOp(op)}
                />
                <span>{op}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={generatePdf}
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate PDF"}
      </button>

      {error && <p className="text-red-600">{error}</p>}
    </main>
  );
}
