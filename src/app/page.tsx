// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh grid place-items-center p-8">
      <div className="text-center space-y-4">
        <Link
  href="/"
  className="absolute top-4 left-4 text-blue-600 hover:underline"
>
  ← Back to Home
</Link>

        <h1 className="text-3xl font-bold text-blue-600">KIDOOZA</h1>
        <p className="text-slate-600">Smarter Learning Powered by AI</p>
        <Link
          href="/worksheets/generate"
          className="inline-block px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Open Worksheet Generator
        </Link>
      </div>
    </main>
  );
}
