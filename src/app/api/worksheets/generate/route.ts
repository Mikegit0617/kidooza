// src/app/api/worksheets/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

type Payload = {
  subject?: string;
  grade?: number;
  difficulty?: string;
  language?: string;
  count?: number;
  ops?: string[]; // ["+","-","×","÷"]
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

function rngInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

type GenOpts = { grade: number; difficulty: string; count: number; ops: string[] };

function makeProblems({ grade, difficulty, count, ops }: GenOpts) {
  const base = Math.max(grade, 1);
  const mult = difficulty === "Hard" ? 15 : difficulty === "Medium" ? 10 : 6;
  const maxN = Math.max(6, base * mult);

  const chosen = ops.length ? ops : ["+"];

  const problems: { q: string; a: number }[] = [];
  for (let i = 0; i < count; i++) {
    const op = chosen[rngInt(0, chosen.length - 1)];
    let a = rngInt(1, maxN);
    let b = rngInt(1, maxN);
    let q = "";
    let ans = 0;

    switch (op) {
      case "+":
        ans = a + b;
        q = `${a} + ${b} = ____`;
        break;
      case "-":
        if (b > a) [a, b] = [b, a];
        ans = a - b;
        q = `${a} - ${b} = ____`;
        break;
      case "×":
        ans = a * b;
        q = `${a} × ${b} = ____`;
        break;
      case "÷":
        // make clean division
        ans = rngInt(1, Math.max(2, Math.floor(maxN / 2)));
        b = rngInt(2, Math.max(2, Math.floor(maxN / ans)));
        a = ans * b;
        q = `${a} ÷ ${b} = ____`;
        break;
      default:
        ans = a + b;
        q = `${a} + ${b} = ____`;
    }
    problems.push({ q, a: ans });
  }
  return problems;
}

/** Try to load a PNG/JPG logo from public/; returns undefined if missing */
async function loadLogoBytes(): Promise<{ bytes: Uint8Array; ext: "png" | "jpg" } | undefined> {
  const candidates = [
    "public/brand/kidooza-logo.png",
    "public/img/kidooza-logo.png",
    "public/logo.png",
    "public/brand/kidooza-logo.jpg",
    "public/img/kidooza-logo.jpg",
    "public/logo.jpg",
  ];
  for (const rel of candidates) {
    try {
      const abs = path.join(process.cwd(), rel);
      const bytes = new Uint8Array(await readFile(abs));
      const ext = rel.endsWith(".png") ? "png" : rel.endsWith(".jpg") ? "jpg" : undefined;
      if (ext) return { bytes, ext };
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function drawFooter(opts: {
  page: any;
  pageNumber: number;
  totalPages: number;
  font: any;
}) {
  const { page, pageNumber, totalPages, font } = opts;
  const width = page.getWidth();
  const margin = 50;
  const y = 40;

  // thin divider line
  page.drawLine({
    start: { x: margin, y: y + 14 },
    end: { x: width - margin, y: y + 14 },
    thickness: 0.5,
    color: rgb(0.82, 0.85, 0.9), // light gray
  });

  // left: slogan
  page.drawText("Smarter Learning Powered by AI", {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.28, 0.35),
  });

  // center: site
  const site = "kidooza.ai";
  const siteWidth = font.widthOfTextAtSize(site, 10);
  page.drawText(site, {
    x: (width - siteWidth) / 2,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.28, 0.35),
  });

  // right: page X of Y
  const ptxt = `Page ${pageNumber} of ${totalPages}`;
  const pw = font.widthOfTextAtSize(ptxt, 10);
  page.drawText(ptxt, {
    x: width - margin - pw,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.28, 0.35),
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: Payload = {};
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json().catch(() => ({} as Payload));
    }

    const subject = (body.subject || "Math").toString().slice(0, 40);
    const grade = clamp(Number(body.grade ?? 3), 1, 12);
    const difficulty = (body.difficulty || "Easy").toString().slice(0, 20);
    const language = (body.language || "en").toString().slice(0, 10);
    const count = clamp(parseInt(String(body.count ?? 20), 10), 5, 100);
    const ops = Array.isArray(body.ops)
      ? body.ops.filter((o) => ["+", "-", "×", "÷"].includes(o)).slice(0, 4)
      : ["+"];

    const problems = makeProblems({ grade, difficulty, count, ops });

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Attempt to embed logo (optional)
    const logo = await loadLogoBytes();
    let logoImage: any | undefined;
    if (logo) {
      logoImage =
        logo.ext === "png"
          ? await pdfDoc.embedPng(logo.bytes)
          : await pdfDoc.embedJpg(logo.bytes);
    }

    // constants
    const letter: [number, number] = [612, 792];
    const margin = 50;

    // --- PAGE 1: Questions ---
    const page1 = pdfDoc.addPage(letter);
    // Header bar area
    if (logoImage) {
      const maxLogoW = 120;
      const logoW = Math.min(maxLogoW, logoImage.width);
      const scale = logoW / logoImage.width;
      const logoH = logoImage.height * scale;
      const logoX = margin;
      const logoY = 792 - margin - logoH;
      page1.drawImage(logoImage, { x: logoX, y: logoY, width: logoW, height: logoH });

      // Title to the right of logo
      page1.drawText(`KIDOOZA Worksheet — ${subject}`, {
        x: logoX + logoW + 16,
        y: logoY + (logoH - 20) / 2,
        size: 20,
        font,
        color: rgb(0.2, 0.2, 0.8),
      });
      // Meta line under the title
      page1.drawText(
        `Grade: ${grade}  |  Difficulty: ${difficulty}  |  Language: ${language}  |  Problems: ${count}`,
        { x: logoX + logoW + 16, y: logoY - 14, size: 11, font }
      );
    } else {
      // Fallback title if no logo found
      page1.drawText(`KIDOOZA Worksheet — ${subject}`, {
        x: margin,
        y: 740,
        size: 20,
        font,
        color: rgb(0.2, 0.2, 0.8),
      });
      page1.drawText(
        `Grade: ${grade}  |  Difficulty: ${difficulty}  |  Language: ${language}  |  Problems: ${count}`,
        { x: margin, y: 710, size: 12, font }
      );
    }

    // Questions in two columns
    const leftX = margin;
    const rightX = 320;
    let y = logoImage ? 680 : 680; // consistent spacing below header
    const step = 24;
    const mid = Math.ceil(problems.length / 2);
    problems.forEach((p, i) => {
      const x = i < mid ? leftX : rightX;
      if (i === mid) y = 680; // reset for second column
      page1.drawText(`${i + 1}. ${p.q}`, { x, y, size: 12, font });
      y -= step;
    });

    // --- PAGE 2: Answer Key ---
    const page2 = pdfDoc.addPage(letter);

    if (logoImage) {
      const maxLogoW = 110;
      const logoW = Math.min(maxLogoW, logoImage.width);
      const scale = logoW / logoImage.width;
      const logoH = logoImage.height * scale;
      const logoX = margin;
      const logoY = 792 - margin - logoH;
      page2.drawImage(logoImage, { x: logoX, y: logoY, width: logoW, height: logoH });

      page2.drawText(`Answer Key — ${subject}`, {
        x: logoX + logoW + 16,
        y: logoY + (logoH - 18) / 2,
        size: 18,
        font,
        color: rgb(0.1, 0.5, 0.2),
      });
    } else {
      page2.drawText(`Answer Key — ${subject}`, {
        x: margin,
        y: 740,
        size: 18,
        font,
        color: rgb(0.1, 0.5, 0.2),
      });
    }

    // answers two columns
    y = 700;
    problems.forEach((p, i) => {
      const x = i % 2 === 0 ? leftX : rightX;
      if (i % 2 === 0 && i > 0) y -= step;
      page2.drawText(`${i + 1}. ${p.a}`, { x, y, size: 12, font });
    });

    // Footer on all pages
    const pages = pdfDoc.getPages();
    pages.forEach((p, idx) =>
      drawFooter({ page: p, pageNumber: idx + 1, totalPages: pages.length, font })
    );

    // Output
    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);

    const safe = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
    const filename = `kidooza_${safe(subject)}_g${grade}_${safe(
      difficulty
    )}_${language}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected PDF generation error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

// Friendly guard for accidental GETs
export function GET() {
  return NextResponse.json(
    { ok: false, message: "Use POST /api/worksheets/generate" },
    { status: 405 }
  );
}

// Allow CORS preflight if you ever call from another origin
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
