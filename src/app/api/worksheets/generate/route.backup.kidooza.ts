/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---- GET helper so visiting /api/worksheets/generate doesn't 404
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/worksheets/generate",
    method: "POST",
    expects: {
      subject: "string",
      grade: "number",
      count: "number",
      demo: "boolean",
      includeKey: "boolean",
      merge: "boolean",
    },
  });
}

// ---- Very small deterministic question generator (demo-friendly)
type Item = { q: string; a: string };
function makeItems(subject: string, grade: number, count: number): Item[] {
  const items: Item[] = [];
  // simple arithmetic for demo; deterministic for same (subject, grade, count)
  for (let i = 1; i <= count; i++) {
    const a = grade + i;
    const b = grade + i + 1;
    if (/sub|minus|subtract/i.test(subject)) {
      items.push({ q: `${b} - ${a} = ______`, a: String(b - a) });
    } else if (/mul|times|x|\*/i.test(subject)) {
      items.push({ q: `${a} × ${b} = ______`, a: String(a * b) });
    } else if (/div|divide|\/|÷/i.test(subject)) {
      const num = (a + 1) * b;
      items.push({ q: `${num} ÷ ${b} = ______`, a: String(num / b) });
    } else {
      // default: addition
      items.push({ q: `${a} + ${b} = ______`, a: String(a + b) });
    }
  }
  return items;
}

// ---- Renders a very basic worksheet page
async function renderWorksheet(subject: string, grade: number, items: Item[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const title = `Worksheet — ${subject} (Grade ${grade})`;
  const dateLine = `Name: __________________    Date: _____________`;

  page.drawText(title, { x: 50, y: 740, size: 18, font, color: rgb(0, 0, 0) });
  page.drawText(dateLine, { x: 50, y: 710, size: 12, font });

  let x = 50;
  let y = 680;
  let n = 1;
  const lineH = 24;

  for (const it of items) {
    page.drawText(`${n}. ${it.q}`, { x, y, size: 12, font });
    y -= lineH;
    if (y < 60) {
      // new page if we run out of room
      const p = doc.addPage([612, 792]);
      y = 740;
      x = 50;
      p.drawText(title, { x: 50, y: 760, size: 14, font });
    }
    n++;
  }

  const bytes = await doc.save();
  return bytes;
}

// ---- Renders a very basic answer key page
async function renderAnswerKey(subject: string, grade: number, items: Item[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const title = `Answer Key — ${subject} (Grade ${grade})`;
  page.drawText(title, { x: 50, y: 740, size: 18, font, color: rgb(0.1, 0.1, 0.1) });

  let y = 700;
  const lineH = 18;
  items.forEach((it, idx) => {
    page.drawText(`${idx + 1}. ${it.a}`, { x: 50, y, size: 12, font });
    y -= lineH;
    if (y < 60) {
      const p = doc.addPage([612, 792]);
      y = 740;
      p.drawText(title, { x: 50, y: 760, size: 14, font });
    }
  });

  const bytes = await doc.save();
  return bytes;
}

// ---- (Optional) Merge two PDFs into one
async function mergeTwo(worksheetBytes: Uint8Array, answerKeyBytes: Uint8Array) {
  const merged = await PDFDocument.create();
  const [wDoc, aDoc] = await Promise.all([
    PDFDocument.load(worksheetBytes),
    PDFDocument.load(answerKeyBytes),
  ]);

  const wPages = await merged.copyPages(wDoc, wDoc.getPageIndices());
  wPages.forEach((p) => merged.addPage(p));
  const aPages = await merged.copyPages(aDoc, aDoc.getPageIndices());
  aPages.forEach((p) => merged.addPage(p));

  const out = await merged.save();
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject ?? "Math").trim();
    const grade = Math.max(0, Number(body.grade ?? 3) | 0);
    const count = Math.max(1, Math.min(50, Number(body.count ?? 20) | 0));
    const demo = Boolean(body.demo ?? true);
    const includeKey = Boolean(body.includeKey ?? true);
    const merge = Boolean(body.merge ?? true);

    // Generate items
    const items = demo ? makeItems(subject, grade, count) : makeItems(subject, grade, count);

    // Render PDFs
    const worksheetBytes = await renderWorksheet(subject, grade, items);
    const answerKeyBytes = includeKey ? await renderAnswerKey(subject, grade, items) : undefined;

    const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

    const resp: any = { ok: true };
    resp.worksheetPdfBase64 = toB64(worksheetBytes);

    if (includeKey && answerKeyBytes) {
      resp.answerKeyPdfBase64 = toB64(answerKeyBytes);
    }

    if (merge && includeKey && answerKeyBytes) {
      const combinedBytes = await mergeTwo(worksheetBytes, answerKeyBytes);
      resp.combinedPdfBase64 = toB64(combinedBytes);
    }

    return NextResponse.json(resp, { status: 200 });
  } catch (err: any) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to generate PDFs." },
      { status: 500 }
    );
  }
}
