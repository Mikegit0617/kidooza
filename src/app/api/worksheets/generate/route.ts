// src/app/api/worksheets/generate/route.ts (v3.9)
// Feature: Separate downloadable Answer Key PDF.
// Behavior:
//  - If includeAnswerKey = false/undefined: returns the student PDF bytes (binary response) — backward compatible.
//  - If includeAnswerKey = true: returns JSON with base64 strings for BOTH PDFs: { ok:true, worksheet:"...", answerKey:"..." }
//    Front-end should decode each and open/download separately.

import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export type GenerateBody = {
  subject: string;
  grade: number;
  difficulty?: "Easy" | "Medium" | "Hard";
  count?: number;
  teacher?: string;
  student?: string;
  includeAnswerKey?: boolean;
};

async function loadPublicImage(filename: string): Promise<Uint8Array> {
  const p = path.join(process.cwd(), "public", "img", filename);
  return fs.readFile(p);
}

async function makeQrPng(text: string): Promise<Uint8Array> {
  const QR = await import("qrcode");
  const dataUrl = await QR.toDataURL(text, { margin: 0, scale: 4 });
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(b64, "base64");
}

function demoProblems(subject: string, count: number) {
  const problems: { q: string; a: string }[] = [];
  for (let i = 1; i <= count; i++) {
    if (subject.toLowerCase() === "math") {
      const a = 10 + i;
      const b = 5 + (i % 5);
      problems.push({ q: `${a} + ${b} = ______`, a: String(a + b) });
    } else if (subject.toLowerCase() === "reading") {
      problems.push({ q: `Circle the noun in: "The quick fox jumps."`, a: "fox" });
    } else {
      problems.push({ q: `${subject} Q${i}: ____________`, a: "" });
    }
  }
  return problems;
}

// ---------- Shared drawing primitives ----------
const PAGE_SIZE: [number, number] = [612, 792];
const BORDER = 24;
const BAND = 54;

async function buildStudentPdf(opts: {
  subject: string;
  grade: number;
  difficulty: string;
  teacher: string;
  student: string;
  worksheetId: string;
  problems: { q: string; a: string }[];
  logoPng?: Uint8Array | null;
}): Promise<Uint8Array> {
  const { subject, grade, difficulty, teacher, student, worksheetId, problems, logoPng } = opts;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImg = await pdf.embedPng(await makeQrPng(`kidooza://worksheet/${worksheetId}`));
  const logo = logoPng ? await pdf.embedPng(logoPng) : null;

  const leftXBase = BORDER + 24;
  const rowH = 40;
  const minBottomSpace = BORDER + 120;

  function chrome(page: PDFPage) {
    const { width, height } = page.getSize();
    // header band
    page.drawRectangle({ x: BORDER, y: height - BORDER - BAND, width: width - BORDER * 2, height: BAND, color: rgb(0.95, 0.97, 1.0) });
    // border
    page.drawRectangle({ x: BORDER, y: BORDER, width: width - BORDER * 2, height: height - BORDER * 2, borderColor: rgb(0.78, 0.82, 0.9), borderWidth: 1 });
    // logo
    if (logo) {
      const logoH = 36; const logoW = (logo.width / logo.height) * logoH;
      const logoX = BORDER + 12; const logoY = height - BORDER - (BAND + logoH) / 2 + 6;
      page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH });
    }
    const titleLeft = BORDER + 12 + 44; const titleTop = height - BORDER - 18;
    page.drawText("KIDOOZA Worksheet", { x: titleLeft, y: titleTop, size: 18, font: fontBold, color: rgb(0.15, 0.2, 0.35) });
    page.drawText(`${subject}  •  Grade ${grade}  •  ${difficulty}`, { x: titleLeft, y: titleTop - 18, size: 12, font, color: rgb(0.25, 0.3, 0.45) });

    // teacher/student
    const rightColX = page.getWidth() - BORDER - 250; const lineY1 = titleTop; const lineGap = 18;
    page.drawText("Teacher:", { x: rightColX, y: lineY1, size: 10, font: fontBold, color: rgb(0.2,0.25,0.35) });
    page.drawText(teacher || "", { x: rightColX + 60, y: lineY1, size: 11, font });
    page.drawText("Student:", { x: rightColX, y: lineY1 - lineGap, size: 10, font: fontBold, color: rgb(0.2,0.25,0.35) });
    page.drawText(student || "", { x: rightColX + 60, y: lineY1 - lineGap, size: 11, font });

    // footer + QR
    const footerY = BORDER + 16; const qrSize = 72; const qrX = page.getWidth() - BORDER - qrSize - 12; const qrY = BORDER + 8;
    page.drawText("Smarter Learning Powered by AI — kidooza.ai", { x: BORDER + 12, y: footerY, size: 9, font, color: rgb(0.35,0.4,0.5) });
    page.drawText(`ID: ${worksheetId}`, { x: qrX - 6, y: qrY + qrSize + 6, size: 10, font: fontBold, color: rgb(0.2,0.25,0.35) });
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  }

  const startPage = () => { const p = pdf.addPage(PAGE_SIZE); chrome(p); const topY = p.getSize().height - BORDER - BAND - 24; return { page: p, cursorY: topY }; };
  let { page, cursorY } = startPage();

  // Name/Date row (first page only)
  page.drawText("Name:", { x: leftXBase, y: cursorY, size: 11, font: fontBold, color: rgb(0.2,0.25,0.35) });
  page.drawLine({ start: { x: leftXBase + 40, y: cursorY - 2 }, end: { x: leftXBase + 260, y: cursorY - 2 }, thickness: 0.6, color: rgb(0.7,0.75,0.85) });
  page.drawText("Date:", { x: leftXBase + 300, y: cursorY, size: 11, font: fontBold, color: rgb(0.2,0.25,0.35) });
  page.drawLine({ start: { x: leftXBase + 340, y: cursorY - 2 }, end: { x: leftXBase + 480, y: cursorY - 2 }, thickness: 0.6, color: rgb(0.7,0.75,0.85) });
  cursorY -= 24;

  const numberCircle = (n: number, x: number, y: number) => {
    page.drawCircle({ x, y, size: 10, borderColor: rgb(0.65,0.7,0.8), borderWidth: 0.8 });
    const w = font.widthOfTextAtSize(String(n), 10);
    page.drawText(String(n), { x: x - w / 2, y: y - 3, size: 10, font, color: rgb(0.2,0.25,0.35) });
  };
  const lineForAnswer = (x1: number, x2: number, y: number) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: rgb(0.7,0.75,0.85) });

  for (const [idx, it] of problems.entries()) {
    if (cursorY < minBottomSpace) { ({ page, cursorY } = startPage()); }
    numberCircle(idx + 1, leftXBase + 6, cursorY - 10);
    page.drawText(it.q, { x: leftXBase + 24, y: cursorY - 16, size: 12, font, color: rgb(0,0,0) });
    lineForAnswer(leftXBase + 24, page.getWidth() - BORDER - 24, cursorY - 24);
    cursorY -= rowH;
  }

  return pdf.save();
}

async function buildAnswerKeyPdf(opts: {
  subject: string;
  grade: number;
  difficulty: string;
  teacher: string;
  student: string;
  worksheetId: string;
  problems: { q: string; a: string }[];
  logoPng?: Uint8Array | null;
}): Promise<Uint8Array> {
  const { subject, grade, difficulty, teacher, student, worksheetId, problems, logoPng } = opts;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImg = await pdf.embedPng(await makeQrPng(`kidooza://worksheet/${worksheetId}`));
  const logo = logoPng ? await pdf.embedPng(logoPng) : null;

  const leftXBase = BORDER + 24;
  const rowH = 50; // taller to fit question + answer lines
  const minBottomSpace = BORDER + 120;

  function chrome(page: PDFPage) {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: BORDER, y: height - BORDER - BAND, width: width - BORDER * 2, height: BAND, color: rgb(1.0, 0.98, 0.9) });
    page.drawRectangle({ x: BORDER, y: BORDER, width: width - BORDER * 2, height: height - BORDER * 2, borderColor: rgb(0.78, 0.82, 0.9), borderWidth: 1 });
    if (logo) { const logoH = 36; const logoW = (logo.width / logo.height) * logoH; const logoX = BORDER + 12; const logoY = height - BORDER - (BAND + logoH) / 2 + 6; page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH }); }
    const titleLeft = BORDER + 12 + 44; const titleTop = height - BORDER - 18;
    page.drawText("KIDOOZA Worksheet — Answer Key", { x: titleLeft, y: titleTop, size: 18, font: fontBold, color: rgb(0.15,0.2,0.35) });
    page.drawText(`${subject}  •  Grade ${grade}  •  ${difficulty}`, { x: titleLeft, y: titleTop - 18, size: 12, font, color: rgb(0.25,0.3,0.45) });
    const rightColX = page.getWidth() - BORDER - 250; const lineY1 = titleTop; const lineGap = 18;
    page.drawText("Teacher:", { x: rightColX, y: lineY1, size: 10, font: fontBold });
    page.drawText(teacher || "", { x: rightColX + 60, y: lineY1, size: 11, font });
    page.drawText("Student:", { x: rightColX, y: lineY1 - lineGap, size: 10, font: fontBold });
    page.drawText(student || "", { x: rightColX + 60, y: lineY1 - lineGap, size: 11, font });
    const footerY = BORDER + 16; const qrSize = 72; const qrX = page.getWidth() - BORDER - qrSize - 12; const qrY = BORDER + 8;
    page.drawText("Smarter Learning Powered by AI — kidooza.ai", { x: BORDER + 12, y: footerY, size: 9, font, color: rgb(0.35,0.4,0.5) });
    page.drawText(`ID: ${worksheetId}`, { x: qrX - 6, y: qrY + qrSize + 6, size: 10, font: fontBold, color: rgb(0.2,0.25,0.35) });
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  }

  const startPage = () => { const p = pdf.addPage(PAGE_SIZE); chrome(p); const topY = p.getSize().height - BORDER - BAND - 24; return { page: p, cursorY: topY }; };
  let { page, cursorY } = startPage();

  page.drawText("Teacher’s Copy — Answers", { x: leftXBase, y: cursorY, size: 14, font: fontBold, color: rgb(0.4,0.3,0.1) });
  cursorY -= 22;

  const numberCircle = (n: number, x: number, y: number) => {
    page.drawCircle({ x, y, size: 10, borderColor: rgb(0.65,0.7,0.8), borderWidth: 0.8 });
    const w = font.widthOfTextAtSize(String(n), 10);
    page.drawText(String(n), { x: x - w / 2, y: y - 3, size: 10, font });
  };

  for (const [idx, it] of problems.entries()) {
    if (cursorY < minBottomSpace) { ({ page, cursorY } = startPage()); }
    numberCircle(idx + 1, leftXBase + 6, cursorY - 10);
    page.drawText(it.q, { x: leftXBase + 24, y: cursorY - 14, size: 12, font, color: rgb(0,0,0) });
    const answer = it.a ? `Answer: ${it.a}` : "(open-ended)";
    page.drawText(answer, { x: leftXBase + 32, y: cursorY - 30, size: 11, font: fontBold, color: rgb(0.1,0.4,0.1) });
    cursorY -= rowH;
  }

  return pdf.save();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateBody;
    const subject = body.subject || "Math";
    const grade = body.grade ?? 3;
    const difficulty = body.difficulty ?? "Easy";
    const count = Math.max(1, Math.min(120, body.count ?? 10));
    const teacher = body.teacher?.trim() || "";
    const student = body.student?.trim() || "";
    const includeAnswerKey = body.includeAnswerKey ?? false;

    const worksheetId = `${subject.slice(0, 2).toUpperCase()}-${Date.now().toString(36).slice(-5)}`;
    const problems = demoProblems(subject, count);
    // --- JSON mode: return items for the Voice Quiz instead of the PDF ---
{
  const url = new URL(req.url);
  const wantsJson =
    url.searchParams.get("mode") === "json" ||
    (req.headers.get("accept") || "").includes("application/json");

  if (wantsJson) {
    const items = problems.map((p: any, i: number) => ({
      id: String(p.id ?? i + 1),
      question:
        p.prompt ??
        p.question ??
        (p.lhs !== undefined && p.rhs !== undefined
          ? `${p.lhs} ${p.op ?? "+"} ${p.rhs} = ____`
          : `Question ${i + 1}`),
      answer:
        p.answer ??
        p.solution ??
        p.result ??
        p.value ??
        p.correct ??
        null,
    }));

    return NextResponse.json({ items });
  }
}


    let logoPng: Uint8Array | null = null;
    try { logoPng = await loadPublicImage("logo.png"); } catch { logoPng = null; }

    // Build the student PDF first
    const studentBytes = await buildStudentPdf({ subject, grade, difficulty, teacher, student, worksheetId, problems, logoPng });

    if (!includeAnswerKey) {
      // Backward-compatible binary return
      return new NextResponse(Buffer.from(studentBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${subject.toLowerCase()}-worksheet.pdf"`,
          "X-Kidooza-WorksheetId": worksheetId,
        },
      });
    }

    // Build a separate Answer Key PDF
    const keyBytes = await buildAnswerKeyPdf({ subject, grade, difficulty, teacher, student, worksheetId, problems, logoPng });

    // Return JSON with base64 strings for both PDFs
    const worksheetB64 = Buffer.from(studentBytes).toString("base64");
    const answerKeyB64 = Buffer.from(keyBytes).toString("base64");

    return NextResponse.json({ ok: true, worksheet: worksheetB64, answerKey: answerKeyB64, id: worksheetId });
  } catch (err: any) {
    console.error("/api/worksheets/generate error", err);
    return NextResponse.json({ ok: false, message: String(err?.message || err) }, { status: 500 });
  }
}

// Delegate GET → POST and preserve the original URL (keeps ?mode=json)
export async function GET(req: Request) {
  const newReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
  });
  return POST(newReq);
}

