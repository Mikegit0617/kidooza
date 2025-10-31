"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "../components/Modal";
import StarBank, { type Badge as KZBadge } from "../../components/StarBank";

/**
 * KIDOOZA — Tutor v3 (shared StarBank)
 * - Lesson picker + Practice questions (earn +1 star per correct)
 * - "hint" support during practice
 * - Shared Star Bank button (view-only)
 * - Quiet toggle, mic input, TTS
 */

const BANK_KEY = "kz:bank:v1";
const QUIET_KEY = "kz:quiet:v1";
const BADGES_KEY = "kz:badges:v1";

const store = {
  getNumber(key: string, def = 0){ try{ const v=Number(localStorage.getItem(key)); return isNaN(v)?def:v; }catch{ return def; } },
  setNumber(key: string, v: number){ try{ localStorage.setItem(key,String(v)); }catch{} },
  getBool(key: string, def = false){ try{ const v=localStorage.getItem(key); return v===null?def:v==="1"; }catch{ return def; } },
  setBool(key: string, v: boolean){ try{ localStorage.setItem(key, v?"1":"0"); }catch{} },
  getJSON<T>(key:string, def:T):T{ try{ const raw=localStorage.getItem(key); return raw? JSON.parse(raw) as T : def; }catch{ return def; } },
  setJSON<T>(key:string, v:T){ try{ localStorage.setItem(key, JSON.stringify(v)); }catch{} },
};

function t(s:string){ return s; }
function norm(x:unknown){ return String(x??"").replace(/[^\w.\- ]+/g," ").replace(/\s+/g," ").trim().toLowerCase(); }
function speakAsync(text:string, quiet:boolean){ return new Promise<void>((resolve)=>{ if(quiet||typeof window==="undefined") return resolve(); const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=1.03; u.onend=()=>resolve(); try{window.speechSynthesis.cancel();}catch{} window.speechSynthesis.speak(u); }); }
async function successChime(quiet=false){ if(quiet||typeof window==="undefined")return; try{ const ctx=new (window.AudioContext || (window as any).webkitAudioContext)(); const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.setValueAtTime(880,ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1320,ctx.currentTime+0.18); g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.4,ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.22); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.25);}catch{} }

type Lesson = "Math" | "Reading" | "Science";
type Msg = { role: "user" | "tutor" | "system"; text: string };
type PracticeQ =
  | { kind: "math"; prompt: string; answer: number }
  | { kind: "reading"; prompt: string; answer: string }
  | { kind: "science"; prompt: string; answer: string };

type Badge = KZBadge;
const BADGES_DEFAULT: Badge[] = [
  { id: "starter25", name: "Shining Starter", emoji: "✨", threshold: 25 },
  { id: "whiz50", name: "Math Whiz", emoji: "🧠", threshold: 50 },
  { id: "champ100", name: "Learning Champ", emoji: "🏆", threshold: 100 },
  { id: "hero200", name: "Study Hero", emoji: "🦸", threshold: 200 },
  { id: "legend400", name: "Star Legend", emoji: "🌟", threshold: 400 },
];

function ri(a:number,b:number){ return a + Math.floor(Math.random()*(b-a+1)); }
function genMath():PracticeQ{ if(Math.random()<0.5){ const x=ri(3,12), y=ri(3,12); return {kind:"math", prompt:`${x} + ${y} = ____`, answer:x+y}; } else { const x=ri(2,9), y=ri(2,9); return {kind:"math", prompt:`${x} × ${y} = ____`, answer:x*y}; } }
function genReading():PracticeQ{ const w=["star","planet","music","happy","brave"][ri(0,4)]; return {kind:"reading", prompt:`Spell the word: ${w}`, answer:w}; }
function genScience():PracticeQ{ const arr=[{p:"What do plants need to make food? (one word)",a:"sunlight"},{p:"What gas do we breathe in to live?",a:"oxygen"},{p:"What force pulls us down to Earth?",a:"gravity"}]; const it=arr[ri(0,arr.length-1)]; return {kind:"science", prompt:it.p, answer:it.a}; }
function hintFor(q:PracticeQ){ if(q.kind==="math") return "Try skip counting or draw groups."; if(q.kind==="reading") return "Say each sound slowly, then blend them together."; return "Think about forces around us every day."; }

export default function TutorPage(){
  const [lesson,setLesson] = useState<Lesson>("Math");
  const [messages,setMessages] = useState<Msg[]>([{role:"tutor", text:"Hi! I’m Kidoo. Choose a lesson and press “Give me a question” to start!"}]);
  const [input,setInput] = useState("");
  const [quiet,setQuiet] = useState(false);
  const [bank,setBank] = useState(0);
  const [badges,setBadges] = useState<Badge[]>(BADGES_DEFAULT);

  const [activeQ,setActiveQ] = useState<PracticeQ|null>(null);
  const [listening,setListening] = useState(false);
  const [showBankPanel,setShowBankPanel] = useState(false);

  const recRef = useRef<SpeechRecognition | null>(null as any);
  const killRef = useRef<() => void>(()=>{});

  useEffect(()=>{ setQuiet(store.getBool(QUIET_KEY,false)); setBank(store.getNumber(BANK_KEY,0));
    const saved = store.getJSON<Badge[]>(BADGES_KEY,BADGES_DEFAULT);
    const merged = BADGES_DEFAULT.map(b=>{ const f=saved.find(x=>x.id===b.id); return f? {...b, earnedAt:f.earnedAt??null } : b; });
    setBadges(merged);
  },[]);

  useEffect(()=>{ if(typeof window==="undefined")return;
    const SR:any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if(!SR)return;
    const r:SpeechRecognition = new SR(); r.lang="en-US"; r.interimResults=false; r.maxAlternatives=1; recRef.current=r;
  },[]);

  function setQuietPersist(v:boolean){ setQuiet(v); store.setBool(QUIET_KEY,v); }

  function creditStars(n:number){
    const after = bank + n; setBank(after); store.setNumber(BANK_KEY, after);
    const updated = badges.map(b=> !b.earnedAt && after>=b.threshold ? ({...b, earnedAt:new Date().toISOString()}) : b );
    setBadges(updated); store.setJSON(BADGES_KEY, updated);
  }

  function push(role:Msg["role"], text:string){ setMessages(m=>[...m,{role,text}]); }

  async function askPractice(){ const q = lesson==="Math"? genMath() : lesson==="Reading"? genReading() : genScience(); setActiveQ(q); push("tutor", q.prompt); await speakAsync(q.prompt, quiet); }

  async function submitUser(text:string){
    const raw = text.trim(); if(!raw) return; push("user", raw); setInput("");

    if (activeQ){
      if (norm(raw)==="hint"){ const h=hintFor(activeQ); push("tutor",`Hint: ${h}`); await speakAsync(`Hint: ${h}`, quiet); return; }
      const expected = norm((activeQ as any).answer), given = norm(raw);
      const ok = typeof (activeQ as any).answer==="number" ? Number(given)===Number((activeQ as any).answer) : given===expected;
      if (ok){ creditStars(1); setActiveQ(null); push("tutor","Correct! ⭐ +1 to your Star Bank. Want another question?"); await successChime(quiet); await speakAsync("Correct! One star added. Want another question?", quiet); }
      else { push("tutor","Close! Try again, or say “hint”."); await speakAsync("Close! Try again, or say hint.", quiet); }
      return;
    }
    const reply = stubReply(raw); push("tutor", reply); await speakAsync(reply, quiet);
  }

  function stubReply(q:string){
    const lc=q.toLowerCase();
    if (/\b(add|plus|\+)\b|\b(\d+\s*\+\s*\d+)\b/.test(lc)){ const m=lc.match(/(\d+)\s*\+\s*(\d+)/); if(m){ const a=Number(m[1])+Number(m[2]); return `Let’s add it: ${m[1]} + ${m[2]} = ${a}. Want a practice question to earn a star?`; } return "Addition puts groups together. Say two numbers, or press “Give me a question”."; }
    if (/\b(multiply|times|\*)\b/.test(lc)) return "Multiplication is repeated addition. Example: 3 × 4 = 12. Want a practice question?";
    if (/\b(read|spell)\b/.test(lc)) return "Reading tip: clap the syllables, then blend. Press “Give me a question” to spell a word.";
    if (/\b(streak|stars|badge|bank)\b/.test(lc)) return "Stars are shared across KIDOOZA. Earn them here or in the Quiz. Keep going!";
    return "Tell me a topic (Math / Reading / Science) or press “Give me a question”. I’m with you!";
  }

  function startListening(){ if(!recRef.current||listening) return; try{ setListening(true); const r=recRef.current!; r.onresult=(e:SpeechRecognitionEvent)=>{ const t=(e.results?.[0]?.[0]?.transcript??"").toString(); setListening(false); submitUser(t); }; r.onerror=()=>setListening(false); r.onend=()=>setListening(false); r.start(); killRef.current=()=>r.abort(); }catch{ setListening(false); } }
  function stopListening(){ try{ killRef.current?.(); }catch{} setListening(false); }

  return (
    <main className="min-h-[100svh] bg-gradient-to-b from-[#ecfeff] to-[#f0fdf4]">
      <div className="max-w-[900px] mx-auto px-4 py-8">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <img src="/img/logo.png" alt="KIDOOZA" className="w-8 h-8 rounded-full border border-white shadow" onError={(e)=>((e.currentTarget.style.display="none"))}/>
            <h1 className="text-2xl md:text-3xl font-semibold">KIDOOZA — Tutor</h1>
          </div>
          <div className="flex items-center gap-2">
            <a href="/quiz" className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200" title="Go to Quiz">➜ Quiz</a>
            <button onClick={()=>setShowBankPanel(true)} className="px-3 py-2 rounded-xl bg-yellow-100 text-yellow-900 border border-yellow-200" title="Open Star Bank">⭐ {t("Bank")} <strong className="ml-1">{bank}</strong></button>
            <button onClick={()=>setQuietPersist(!quiet)} className={`px-3 py-2 rounded-xl border ${quiet?"bg-violet-50 border-violet-200 text-violet-800":"bg-gray-50 border-gray-200"}`}>{quiet?"🌙 Quiet":"🔊 Sound"}</button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            {(["Math","Reading","Science"] as Lesson[]).map(L=>(
              <button key={L} onClick={()=>setLesson(L)} className={`px-3 py-2 text-sm ${lesson===L?"bg-blue-600 text-white":"hover:bg-gray-50"}`}>{L}</button>
            ))}
          </div>
          <button onClick={askPractice} className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">➕ {t("Give me a question")}</button>
        </div>

        {activeQ && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900">
            <b>{t("Practice Mode:")}</b> {t("Answer to earn")} <span className="font-semibold">+1 ⭐</span>.{" "}
            <span className="text-emerald-700">{t("Question:")} {activeQ.prompt}</span>{" "}
            <span className="text-emerald-800">({t("say “hint” for help")})</span>
          </div>
        )}

        <div className="p-5 rounded-2xl shadow-sm border border-gray-100 bg-white/80">
          <div className="h-[52vh] overflow-y-auto pr-1 space-y-3">
            {messages.map((m,i)=>(
              <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.role==="tutor"?"bg-blue-50 border border-blue-100 text-slate-800":m.role==="system"?"bg-gray-50 border border-gray-200 text-slate-700 mx-auto":"bg-emerald-50 border border-emerald-100 ml-auto"}`}>{m.text}</div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") submitUser(input); }}
              placeholder={activeQ? "Type your answer (or say 'hint')":"Ask me anything…"}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"/>
            <button onClick={()=>submitUser(input)} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Send</button>
            <button onClick={listening? stopListening : startListening} className={`px-3 py-2 rounded-xl ${listening?"bg-red-100":"bg-gray-100 hover:bg-gray-200"}`}>{listening?"⏹ Stop":"🎤 Speak"}</button>
          </div>

          <p className="mt-2 text-xs text-gray-500">{t("Tutor is local-only. Practice questions add stars to the same Star Bank used in Quiz.")}</p>
        </div>
      </div>

      {showBankPanel && (
        
          <StarBank bank={bank} badges={badges} mode="view" onClose={()=>setShowBankPanel(false)} />
        </Modal>
      )}
    </main>
  );
}
