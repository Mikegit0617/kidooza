import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

/* ===== Utilities ===== */
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff; }
function pick<T>(arr: T[], r: () => number) { return arr[Math.floor(r() * arr.length)]; }
function randint(min: number, max: number, r: () => number) {
  return Math.floor(r() * (max - min + 1)) + min;
}

/* ===== Word Problems (templates) ===== */
type Maker = (grade: number, r: () => number) => { q: string; a: number };
const WORD_TEMPLATES: Maker[] = [
  (grade, r) => {
    const a = randint(3, 12, r), b = randint(2, 9, r);
    const name = pick(["Liam","Ava","Noah","Mia","Lucas","Emma"], r);
    const thing = pick(["apples","stickers","marbles","blocks","shells"], r);
    return { q: `${name} has ${a} ${thing}. ${name} gets ${b} more. How many ${thing} now?`, a: a + b };
  },
  (grade, r) => {
    const a = randint(8, 18, r), b = randint(2, Math.min(9, a - 1), r);
    const name = pick(["Leo","Sofia","Ethan","Isla","Mason","Chloe"], r);
    const thing = pick(["balloons","pencils","cookies","crayons"], r);
    return { q: `${name} has ${a} ${thing}. ${b} ${b===1?"is":"are"} given away. How many left?`, a: a - b };
  },
  (grade, r) => {
    const g = randint(2, 5, r), e = randint(2, 6, r);
    const thing = pick(["rows of chairs","bags with oranges","teams with players"], r);
    return { q: `There are ${g} ${thing}. Each has ${e}. How many in all?`, a: g * e };
  },
  (grade, r) => {
    const total = randint(12, 30, r), kids = pick([2,3,4,5,6], r);
    const thing = pick(["cupcakes","stickers","berries"], r);
    return { q: `${total} ${thing} are shared equally among ${kids} kids. How many does each get?`, a: Math.floor(total / kids) };
  },
  (grade, r) => {
    const a = randint(10, 25, r), b = randint(5, 20, r);
    const n1 = pick(["Aria","James","Nora","Elijah"], r), n2 = pick(["Zoe","Logan","Lily","Henry"], r);
    const thing = pick(["points","cards","books"], r);
    return { q: `${n1} has ${a} ${thing}. ${n2} has ${b} ${thing}. How many more does ${n1} have?`, a: a - b };
  },
];

function makeWordProblems(grade: number, count: number, demo: boolean) {
  const r = rng(demo ? 20251029 + (grade || 0) * 17 + count * 3 : Date.now());
  return Array.from({ length: count }, (_, idx) => {
    const it = pick(WORD_TEMPLATES, r)(grade, r);
    return { q: it.q, a: it.a, meta: { type: "word", idx, grade } };
  });
}

/* ===== Core Math Generators ===== */
function makeAdd(count: number, r: () => number) {
  return Array.from({ length: count }, () => {
    const a = randint(0, 99, r), b = randint(0, 99, r);
    return { q: `${a} + ${b} = ?`, a: a + b };
  });
}
function makeSub(count: number, r: () => number) {
  return Array.from({ length: count }, () => {
    const a = randint(0, 99, r), b = randint(0, a, r);
    return { q: `${a} - ${b} = ?`, a: a - b };
  });
}
function makeMul(count: number, r: () => number) {
  return Array.from({ length: count }, () => {
    const a = randint(0, 12, r), b = randint(0, 12, r);
    return { q: `${a} × ${b} = ?`, a: a * b };
  });
}
function makeDiv(count: number, r: () => number) {
  return Array.from({ length: count }, () => {
    const b = randint(1, 12, r), a = b * randint(0, 12, r);
    return { q: `${a} ÷ ${b} = ?`, a: Math.floor(a / b) };
  });
}

/* ===== Handler ===== */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subject = String(body.subject || "Addition");
    const grade = Number(body.grade ?? 1);
    const difficulty = String(body.difficulty || "Easy");
    const count = Math.min(Math.max(Number(body.count || 10), 1), 50);
    const demo = !!body.demo;

    const r = rng(demo ? 123456 : Date.now());
    let items: Array<{ q: string; a: string | number; meta?: any }>;

    switch (subject) {
      case "WordProblems": items = makeWordProblems(grade, count, demo); break;
      case "Subtraction": items = makeSub(count, r).map((x,i)=>({ ...x, meta:{type:"sub",idx:i} })); break;
      case "Multiplication": items = makeMul(count, r).map((x,i)=>({ ...x, meta:{type:"mul",idx:i} })); break;
      case "Division": items = makeDiv(count, r).map((x,i)=>({ ...x, meta:{type:"div",idx:i} })); break;
      default: items = makeAdd(count, r).map((x,i)=>({ ...x, meta:{type:"add",idx:i} })); break;
    }

    return NextResponse.json({ items, meta: { subject, grade, difficulty } });
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message || e}`, { status: 400 });
  }
}
