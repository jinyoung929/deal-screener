import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, GitCompare, Bell, Moon, Sun, Search,
  TrendingUp, TrendingDown, Minus, X, Plus, ArrowLeft,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  SlidersHorizontal, Building2, Trash2, Filter, BarChart3,
  ShieldAlert, ShieldCheck, Shield, Zap, Bookmark, BookmarkCheck,
  ExternalLink, Download, Printer, Info, ChevronUp, FileSpreadsheet, Newspaper
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { motion } from "motion/react";
import { api, type ApiUser, type NewsArticle } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = "safe" | "warning" | "danger";
type ViewId = "dashboard" | "detail" | "compare" | "alerts" | "watchlist";

interface TSPoint { year: string; value: number }
interface AiFlag {
  id: string; tag: string; severity: "high" | "medium" | "low";
  summary: string; basis: string;
}
interface RelatedTx { date: string; type: string; amount: number; party: string; desc: string }
interface Ownership { entity: string; share: number; type: string }

interface Company {
  id: number; name: string; ticker: string; sector: string;
  marketCap: number | null; score: number; prevScore: number;
  scoreTrend: "up" | "down" | "stable";
  lastDisclosure: string | null; flags: string[];
  dartNo: string | null; auditor: string | null; fiscalYear: string | null;
  revenue: TSPoint[]; debtRatio: TSPoint[]; opMargin: TSPoint[]; currentRatio: TSPoint[];
  aiFlags: AiFlag[]; relatedTx: RelatedTx[]; ownership: Ownership[];
  description: string;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const getRisk = (s: number): RiskLevel => s >= 66 ? "danger" : s >= 31 ? "warning" : "safe";

const riskConfig = {
  safe:    { label:"안전",  badgeCls:"bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800", rowBorder:"#10b981", arc:"#10b981", dot:"bg-emerald-500", glow:"rgba(16,185,129,0.35)", kpiIcon:"bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" },
  warning: { label:"주의",  badgeCls:"bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",   rowBorder:"#f59e0b", arc:"#f59e0b", dot:"bg-amber-500",   glow:"rgba(245,158,11,0.35)",  kpiIcon:"bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
  danger:  { label:"위험",  badgeCls:"bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",               rowBorder:"#ef4444", arc:"#ef4444", dot:"bg-red-500",     glow:"rgba(239,68,68,0.4)",    kpiIcon:"bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
};

const severityConfig = {
  high:   { label:"High", stripe:"bg-red-500",   pill:"bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800" },
  medium: { label:"Med",  stripe:"bg-amber-500", pill:"bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" },
  low:    { label:"Low",  stripe:"bg-blue-500",  pill:"bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" },
};

const SECTOR_COLORS: Record<string, string> = {
  화학:"#8b5cf6", IT:"#3b82f6", 바이오:"#10b981", 철강:"#f59e0b",
  식품:"#f97316", 중공업:"#64748b", 반도체:"#06b6d4",
};

const fmtMarketCap = (v: number | null) => v == null ? "—" : v >= 10000 ? `${(v/10000).toFixed(1)}조` : `${v.toLocaleString()}억`;
const fmtDate = (s: string | null) => s == null ? "—" : s.replace(/-/g,".");
const fmtAmount = (v: number) => `${v.toLocaleString()}억원`;
// Chart Y-axis labels: real revenue figures run to 6 digits in 억원, which
// overflowed the axis area and got clipped to their trailing digits
// ("199463" rendered as "0000"-style garbage). Abbreviate to 조 instead.
const fmtAxisValue = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v/10000).toFixed(abs >= 100000 ? 0 : 1)}조`;
  if (abs >= 1000) return `${(v/1000).toFixed(1)}천`;
  return String(v);
};
const dartFilingUrl = (dartNo: string | null) => dartNo ? `https://dart.fss.or.kr/dsab007/main.do?rcpNo=${dartNo}` : null;

function computeBreakdown(c: Company) {
  const latestD = c.debtRatio.at(-1)?.value ?? 100;
  const latestO = c.opMargin.at(-1)?.value ?? 5;
  const latestCR = c.currentRatio.at(-1)?.value ?? 150;

  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  // Negative debt ratio means negative equity (완전자본잠식) -- the most
  // severe leverage risk, not the safest (latestD/3 would otherwise clamp
  // very negative ratios down to 0 risk).
  const dRisk  = latestD < 0 ? 100 : latestD > 300 ? 100 : latestD > 200 ? clamp(70+(latestD-200)/10) : latestD > 100 ? clamp(30+(latestD-100)/100*40) : clamp(latestD/3);
  const oRisk  = latestO < 0 ? clamp(70+(-latestO)*3) : latestO < 5 ? clamp(40+(5-latestO)*6) : clamp(25-(latestO-5)*2);
  const crRisk = latestCR < 50 ? clamp(80+(50-latestCR)) : latestCR < 100 ? clamp(30+(100-latestCR)*0.8) : latestCR < 200 ? clamp(10+(200-latestCR)*0.2) : clamp(10-(latestCR-200)*0.02);
  const trRisk = c.scoreTrend === "up" ? 80 : c.scoreTrend === "stable" ? 40 : 15;
  const flRisk = clamp(c.flags.length * 22);

  return [
    { label:"부채비율",         desc:"재무레버리지 위험", weight:30, risk:dRisk,  value:`${latestD}%`,          hint:"200% 초과 고위험" },
    { label:"영업이익률",       desc:"수익성 위험",       weight:25, risk:oRisk,  value:`${latestO.toFixed(1)}%`, hint:"0% 미만 손실구간" },
    { label:"유동비율",         desc:"단기 유동성 위험",   weight:15, risk:crRisk, value:`${latestCR.toFixed(0)}%`, hint:"100% 미만 위험구간" },
    { label:"스코어 추이",      desc:"위험 방향성",       weight:15, risk:trRisk, value:c.scoreTrend==="up"?"상승↑":c.scoreTrend==="down"?"하락↓":"유지—", hint:"지속 상승 시 가중" },
    { label:"Red Flag 수",     desc:"공시 이상징후",     weight:15, risk:flRisk, value:`${c.flags.length}건`,  hint:"건당 22점 가산" },
  ];
}

function exportCSV(companies: Company[]) {
  const BOM = "﻿";
  const headers = ["기업명","티커","업종","시가총액(억)","위험스코어","전일대비","위험등급","최근공시일","감사인","Red Flag수","주요 Red Flag"];
  const rows = companies.map(c => [
    c.name, c.ticker, c.sector, c.marketCap, c.score,
    c.score - c.prevScore > 0 ? `+${c.score-c.prevScore}` : `${c.score-c.prevScore}`,
    riskConfig[getRisk(c.score)].label,
    c.lastDisclosure, c.auditor, c.flags.length,
    `"${c.flags.slice(0,3).join(", ")}"`
  ]);
  const csv = BOM + [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `DealScreener_${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}


// ── Data ──────────────────────────────────────────────────────────────────────

const SECTORS = ["화학","IT","바이오","철강","식품","중공업","반도체","기타"];
// Real current date rather than a fixed mock string. This is a display
// label, not a claim about when DART data was last synced -- see each
// company's own lastDisclosure for that.
const ANALYSIS_DATE = fmtDate(new Date().toISOString().slice(0, 10));
const ANALYSIS_VER = "v1.0";

// ── Score Gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef<number>(0);
  useEffect(() => {
    setDisplay(0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now-start)/1200,1), eased = 1-Math.pow(1-t,3);
      setDisplay(Math.round(eased*score));
      if (t<1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [score]);

  const level = getRisk(score);
  const color = riskConfig[level].arc, glow = riskConfig[level].glow;
  const r=76, cx=110, cy=115, total=Math.PI*r, offset=total*(1-display/100);

  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="135" viewBox="0 0 220 135">
        <defs>
          <linearGradient id={`gg-${level}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.4}/>
            <stop offset="100%" stopColor={color} stopOpacity={1}/>
          </linearGradient>
        </defs>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth="14" strokeLinecap="round"/>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth="22" strokeLinecap="round" strokeDasharray={total} strokeDashoffset={offset}/>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={`url(#gg-${level})`} strokeWidth="13" strokeLinecap="round" strokeDasharray={total} strokeDashoffset={offset} style={{filter:`drop-shadow(0 0 6px ${glow})`, transition:"stroke-dashoffset 0.04s linear"}}/>
        <text x={cx} y={cy-18} textAnchor="middle" fontSize="44" fontWeight="600" fontFamily="'JetBrains Mono',monospace" fill="currentColor">{display}</text>
        <text x={cx} y={cy-2} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.4} fontFamily="'JetBrains Mono',monospace">/ 100</text>
        <text x={cx-r+2} y={cy+20} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.3}>0</text>
        <text x={cx+r-2} y={cy+20} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.3}>100</text>
      </svg>
      <span className={`text-xs font-semibold px-3 py-1 rounded-full tracking-wide ${riskConfig[level].badgeCls}`}>{riskConfig[level].label}</span>
    </div>
  );
}

// ── Score Badge & Bar ─────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const lv = getRisk(score);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono font-medium ${riskConfig[lv].badgeCls}`}>
      <span className={`size-1.5 rounded-full flex-shrink-0 ${riskConfig[lv].dot}`}/>
      {score}
    </span>
  );
}

function Delta({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev;
  if (d === 0) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={`font-mono text-[11px] font-semibold ${d>0?"text-red-500":"text-emerald-500"}`}>
      {d>0?"+":""}{d}
    </span>
  );
}

function ScoreBar({ score, prev }: { score: number; prev: number }) {
  const lv = getRisk(score);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{width:`${score}%`,background:riskConfig[lv].arc}}/>
      </div>
      <ScoreBadge score={score}/>
      <Delta curr={score} prev={prev}/>
    </div>
  );
}

function FlagTag({ label }: { label: string }) {
  return <span className="inline-flex text-[10px] px-1.5 py-px rounded-sm border border-border/60 bg-muted/60 text-muted-foreground whitespace-nowrap">{label}</span>;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground font-mono mb-1">{label}</p>
      {payload.map((e:any,i:number)=>(
        <p key={i} className="font-mono font-medium" style={{color:e.stroke||e.fill}}>{typeof e.value==="number"?e.value.toFixed(2):e.value}</p>
      ))}
    </div>
  );
}

function MetricAreaChart({ title, data, color, refVal, refLabel }: { title:string; data:TSPoint[]; color:string; refVal?:number; refLabel?:string }) {
  const id = `g-${title.replace(/[^a-z0-9]/gi,"")}`;
  if (data.length === 0) {
    return (
      <div className="border border-border/60 rounded-xl p-4 bg-card shadow-sm">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
        <div className="h-[148px] flex items-center justify-center text-[12px] text-muted-foreground">데이터 부족</div>
      </div>
    );
  }
  return (
    <div className="border border-border/60 rounded-xl p-4 bg-card shadow-sm">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      <ResponsiveContainer width="100%" height={148}>
        <AreaChart data={data} margin={{top:4,right:4,left:0,bottom:0}}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.18}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity={0.06}/>
          <XAxis dataKey="year" tick={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",fill:"currentColor",opacity:0.45}} axisLine={false} tickLine={false}/>
          <YAxis width={44} tickFormatter={fmtAxisValue} tick={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",fill:"currentColor",opacity:0.45}} axisLine={false} tickLine={false}/>
          <Tooltip content={<ChartTooltip/>}/>
          {refVal!==undefined&&<ReferenceLine y={refVal} stroke={color} strokeDasharray="3 3" strokeOpacity={0.5} label={{value:refLabel,fontSize:9,fill:color,position:"insideTopRight"}}/>}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={{r:3,fill:color,strokeWidth:0}} activeDot={{r:5,strokeWidth:0}}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Score Breakdown Panel ─────────────────────────────────────────────────────

function ScoreBreakdownPanel({ company, onClose }: { company: Company; onClose: () => void }) {
  const items = computeBreakdown(company);
  const total = items.reduce((s,i) => s + i.risk*i.weight/100, 0);

  return (
    <div className="border border-border/60 rounded-xl bg-card shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-blue-500"/>
          <span className="text-[12px] font-semibold">스코어 산출 근거</span>
          <span className="text-[10px] text-muted-foreground font-mono ml-1">— 가중 합산 모델</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">총 위험 스코어:</span>
          <ScoreBadge score={company.score}/>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14}/></button>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {items.map(item => {
          const lv = item.risk>=66?"danger":item.risk>=31?"warning":"safe";
          const contribution = (item.risk*item.weight/100).toFixed(1);
          return (
            <div key={item.label} className="grid grid-cols-[160px_1fr_60px_48px_48px] items-center gap-3">
              <div>
                <p className="text-[12px] font-medium leading-none">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <div className="relative h-4 bg-muted/50 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{width:`${item.risk}%`, background:riskConfig[lv].arc, opacity:0.85}}/>
                <div className="absolute inset-y-0 left-0 flex items-center pl-2">
                  <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow" style={{fontSize:"9px"}}>{item.risk}</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground text-right">{item.value}</span>
              <span className="text-[10px] font-mono text-muted-foreground text-right">×{item.weight}%</span>
              <span className="text-[12px] font-mono font-semibold text-right" style={{color:riskConfig[lv].arc}}>{contribution}</span>
            </div>
          );
        })}
        <div className="pt-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">가중 합산 총점 (반올림 적용)</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">{total.toFixed(1)} →</span>
            <ScoreBadge score={company.score}/>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 pb-1">
          * 가중치: 부채비율(30%) + 영업이익률(25%) + 유동비율(15%) + 스코어추이(15%) + Red Flag(15%) = 100%
        </p>
      </div>
    </div>
  );
}

// ── Print View ────────────────────────────────────────────────────────────────

function PrintView({ companies }: { companies: Company[] }) {
  const now = new Date().toLocaleString("ko-KR");
  return (
    <div style={{fontFamily:"'Inter',sans-serif",padding:"0",color:"#000",background:"#fff"}}>
      <div style={{borderBottom:"2px solid #000",paddingBottom:"8px",marginBottom:"16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <h1 style={{fontSize:"18px",fontWeight:"700",margin:"0",letterSpacing:"-0.5px"}}>DealScreener — 위험 스크리닝 보고서</h1>
            <p style={{fontSize:"11px",color:"#444",margin:"4px 0 0"}}>분석 기준일: {ANALYSIS_DATE} · 버전: {ANALYSIS_VER} · 분석 대상: {companies.length}개 상장사 · 생성: {now}</p>
          </div>
          <div style={{textAlign:"right",fontSize:"10px",color:"#666"}}>
            <p style={{margin:"0"}}>기밀 — 내부 열람용</p>
            <p style={{margin:"2px 0 0"}}>Powered by DealScreener AI</p>
          </div>
        </div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
        <thead>
          <tr style={{background:"#030213",color:"#fff"}}>
            {["#","기업명","업종","시총","스코어","전일대비","위험등급","부채비율","영업이익률","Red Flags","감사인","공시일"].map(h=>(
              <th key={h} style={{padding:"6px 8px",textAlign:"left",fontWeight:"600",fontSize:"10px",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {companies.sort((a,b)=>b.score-a.score).map((c,i)=>{
            const lv=getRisk(c.score), delta=c.score-c.prevScore;
            const latestD=c.debtRatio.at(-1)?.value??0, latestO=c.opMargin.at(-1)?.value??0;
            const bg = lv==="danger"?"#fff5f5":lv==="warning"?"#fffbf0":"#f0fdf4";
            const scoreColor = lv==="danger"?"#dc2626":lv==="warning"?"#d97706":"#16a34a";
            return (
              <tr key={c.id} style={{background:i%2===0?bg:"#fff",borderBottom:"1px solid #e5e7eb"}}>
                <td style={{padding:"5px 8px",fontFamily:"monospace",color:"#666"}}>{i+1}</td>
                <td style={{padding:"5px 8px",fontWeight:"600"}}>{c.name}</td>
                <td style={{padding:"5px 8px",color:"#555"}}>{c.sector}</td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",textAlign:"right"}}>{fmtMarketCap(c.marketCap)}</td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",fontWeight:"700",color:scoreColor,textAlign:"right"}}>{c.score}</td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",fontWeight:"600",color:delta>0?"#dc2626":delta<0?"#16a34a":"#666",textAlign:"right"}}>{delta>0?`+${delta}`:delta}</td>
                <td style={{padding:"5px 8px"}}><span style={{background:scoreColor,color:"#fff",padding:"1px 6px",borderRadius:"3px",fontSize:"10px",fontWeight:"600"}}>{riskConfig[lv].label}</span></td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",textAlign:"right",color:latestD>200?"#dc2626":"#333"}}>{latestD}%</td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",textAlign:"right",color:latestO<0?"#dc2626":"#333"}}>{latestO.toFixed(1)}%</td>
                <td style={{padding:"5px 8px",fontSize:"10px",color:"#555"}}>{c.flags.slice(0,2).join(", ")}{c.flags.length>2?` +${c.flags.length-2}`:""}</td>
                <td style={{padding:"5px 8px",color:"#555"}}>{c.auditor}</td>
                <td style={{padding:"5px 8px",fontFamily:"monospace",color:"#666"}}>{fmtDate(c.lastDisclosure)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{marginTop:"16px",borderTop:"1px solid #ccc",paddingTop:"8px",fontSize:"10px",color:"#888",display:"flex",justifyContent:"space-between"}}>
        <span>위험등급: 빨강(≥66) 주의(31-65) 안전(≤30) · 부채비율 200% 초과=고위험</span>
        <span>DealScreener {ANALYSIS_VER} · 본 보고서는 AI 스크리닝 결과이며 투자 판단의 참고용입니다</span>
      </div>
    </div>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────────────────────

function KPIStrip({ companies }: { companies: Company[] }) {
  // Companies whose sync hasn't produced a score yet (e.g. corp_code lookup
  // failed) are excluded from these tallies rather than silently counted as
  // "safe" -- getRisk(null) would otherwise fall through to the safe bucket.
  const scored = companies.filter(c=>c.score!=null);
  const danger=scored.filter(c=>getRisk(c.score)==="danger").length;
  const warning=scored.filter(c=>getRisk(c.score)==="warning").length;
  const safe=scored.filter(c=>getRisk(c.score)==="safe").length;
  const avg=scored.length ? Math.round(scored.reduce((s,c)=>s+c.score,0)/scored.length) : 0;
  const risen=scored.filter(c=>c.score>c.prevScore).length;
  const cards=[
    { label:"전체 분석", value:companies.length, unit:"개 기업", icon:Building2, iconCls:"bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400", grad:"from-blue-500/8" },
    { label:"위험 경보", value:danger, unit:"건 즉시 검토", icon:ShieldAlert, iconCls:riskConfig.danger.kpiIcon, grad:"from-red-500/8" },
    { label:"주의 추적", value:warning, unit:"건 모니터링", icon:Shield, iconCls:riskConfig.warning.kpiIcon, grad:"from-amber-500/8" },
    { label:"안전 기업", value:safe, unit:"건 정상 범위", icon:ShieldCheck, iconCls:riskConfig.safe.kpiIcon, grad:"from-emerald-500/8" },
    { label:"평균 스코어", value:avg, unit:"전체 기업 평균", icon:BarChart3, iconCls:"bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400", grad:"from-violet-500/8" },
    { label:"스코어 상승", value:risen, unit:"건 전일 대비", icon:TrendingUp, iconCls:"bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400", grad:"from-red-500/8" },
  ];
  return (
    <div className="grid grid-cols-6 gap-2.5 px-5 py-3.5 border-b border-border/60 bg-card/60">
      {cards.map(({ label, value, unit, icon:Icon, iconCls, grad }) => (
        <div key={label} className={`rounded-xl p-3 bg-gradient-to-br ${grad} to-transparent border border-border/40`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
            <div className={`size-6 rounded-md flex items-center justify-center ${iconCls}`}><Icon size={12}/></div>
          </div>
          <p className="text-[22px] font-semibold font-mono leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{unit}</p>
        </div>
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { id:"dashboard" as ViewId, label:"스크리닝", icon:LayoutDashboard },
  { id:"watchlist" as ViewId, label:"워치리스트", icon:Bookmark },
  { id:"compare"   as ViewId, label:"비교 분석",  icon:GitCompare },
  { id:"alerts"    as ViewId, label:"알림 설정",  icon:Bell },
];

function Sidebar({ view, setView, dark, setDark, watchCount, user }: {
  view:ViewId; setView:(v:ViewId)=>void; dark:boolean; setDark:(d:boolean)=>void; watchCount:number; user:ApiUser|null;
}) {
  return (
    <aside className="w-[196px] flex-shrink-0 flex flex-col h-full" style={{background:"#06070f",borderRight:"1px solid rgba(255,255,255,0.05)"}}>
      <div className="px-5 py-5" style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:"linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)"}}>
            <SlidersHorizontal size={15} className="text-white"/>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white leading-none">DealScreener</p>
            <p className="text-[10px] mt-0.5" style={{color:"rgba(255,255,255,0.3)"}}>DART AI 스크리닝</p>
          </div>
        </div>
        <div className="mt-3 px-2 py-1.5 rounded-lg text-[10px]" style={{background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.35)"}}>
          <span className="font-mono">{ANALYSIS_DATE}</span> · <span>{ANALYSIS_VER}</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-2.5 mb-2.5" style={{color:"rgba(255,255,255,0.22)"}}>메뉴</p>
        {NAV.map(({ id, label, icon:Icon }) => {
          const active = view===id;
          return (
            <button key={id} onClick={()=>setView(id)} className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[13px] transition-all relative"
              style={{background:active?"rgba(255,255,255,0.08)":"transparent",color:active?"#fff":"rgba(255,255,255,0.42)",borderLeft:active?"2px solid #3b82f6":"2px solid transparent"}}>
              <Icon size={15}/>
              {label}
              {id==="watchlist"&&watchCount>0&&(
                <span className="ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full" style={{background:"#3b82f6",color:"#fff"}}>{watchCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <button onClick={()=>setDark(!dark)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] mb-2 transition-colors"
          style={{color:"rgba(255,255,255,0.38)"}}
          onMouseEnter={e=>(e.currentTarget.style.color="rgba(255,255,255,0.72)")}
          onMouseLeave={e=>(e.currentTarget.style.color="rgba(255,255,255,0.38)")}>
          {dark?<Sun size={14}/>:<Moon size={14}/>}
          {dark?"라이트 모드":"다크 모드"}
        </button>
        {user ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="size-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 text-white" style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)"}}>{(user.name||user.email)[0]}</div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium leading-none truncate" style={{color:"rgba(255,255,255,0.75)"}}>{user.name||user.email}</p>
              <a href="/auth/logout" onClick={e=>{e.preventDefault();fetch("/auth/logout",{method:"POST",credentials:"include"}).then(()=>window.location.reload());}}
                className="text-[10px] mt-0.5 block hover:underline" style={{color:"rgba(255,255,255,0.28)"}}>로그아웃</a>
            </div>
          </div>
        ) : (
          <a href={api.loginUrl} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)"}}>
            Google로 로그인
          </a>
        )}
      </div>
    </aside>
  );
}

// ── Filter Panel ──────────────────────────────────────────────────────────────

interface Filters { search:string; sectors:string[]; riskLevels:string[]; sortBy:"score"|"disclosure"|"marketCap"; sortDir:"desc"|"asc" }

function FilterSection({ title, children }: { title:string; children:React.ReactNode }) {
  const [open,setOpen]=useState(true);
  return (
    <div className="border-b border-border/50">
      <button onClick={()=>setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
        {title}{open?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
      </button>
      {open&&<div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function FilterPanel({ filters, setFilters }: { filters:Filters; setFilters:(f:Filters)=>void }) {
  const toggle=(arr:string[],v:string)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];
  return (
    <aside className="w-[205px] flex-shrink-0 border-r border-border/60 flex flex-col h-full overflow-y-auto bg-card/30">
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
        <Filter size={11} className="text-muted-foreground"/>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">필터</span>
        {(filters.sectors.length>0||filters.riskLevels.length>0)&&(
          <button onClick={()=>setFilters({...filters,sectors:[],riskLevels:[]})} className="ml-auto text-[10px] text-blue-500 hover:text-blue-400 font-semibold">초기화</button>
        )}
      </div>
      <FilterSection title="업종">
        {SECTORS.map(s=>(
          <label key={s} className="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" checked={filters.sectors.includes(s)} onChange={()=>setFilters({...filters,sectors:toggle(filters.sectors,s)})} className="rounded border-border accent-blue-500"/>
            <span className="size-1.5 rounded-full flex-shrink-0" style={{background:SECTOR_COLORS[s]||"#888"}}/>
            <span className="text-[12px] text-foreground/70 group-hover:text-foreground transition-colors">{s}</span>
          </label>
        ))}
      </FilterSection>
      <FilterSection title="위험도">
        {(["danger","warning","safe"] as RiskLevel[]).map(lv=>(
          <label key={lv} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filters.riskLevels.includes(lv)} onChange={()=>setFilters({...filters,riskLevels:toggle(filters.riskLevels,lv)})} className="rounded border-border accent-blue-500"/>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${riskConfig[lv].badgeCls}`}>{riskConfig[lv].label}</span>
          </label>
        ))}
      </FilterSection>
      <FilterSection title="정렬">
        {([{val:"score",label:"위험 스코어"},{val:"disclosure",label:"최근 공시일"},{val:"marketCap",label:"시가총액"}] as {val:Filters["sortBy"];label:string}[]).map(({val,label})=>(
          <label key={val} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="sortBy" checked={filters.sortBy===val} onChange={()=>setFilters({...filters,sortBy:val})} className="accent-blue-500"/>
            <span className="text-[12px] text-foreground/70">{label}</span>
          </label>
        ))}
        <div className="flex gap-1.5 mt-2">
          {(["desc","asc"] as const).map(dir=>(
            <button key={dir} onClick={()=>setFilters({...filters,sortDir:dir})} className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-all font-semibold ${filters.sortDir===dir?"bg-primary text-primary-foreground border-primary":"border-border text-muted-foreground hover:bg-muted"}`}>
              {dir==="desc"?"↓ 높은순":"↑ 낮은순"}
            </button>
          ))}
        </div>
      </FilterSection>
    </aside>
  );
}

// ── Add Company Form ─────────────────────────────────────────────────────────

function AddCompanyForm({ user, onAdded }: { user: ApiUser | null; onAdded: (c: Company) => void }) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [sector, setSector] = useState(SECTORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <a href={api.loginUrl} title="기업 추가는 로그인이 필요합니다"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground">
        <Plus size={13}/> 기업 추가
      </a>
    );
  }

  const submit = async () => {
    if (!/^\d{6}$/.test(ticker)) { setError("종목코드는 6자리 숫자입니다"); return; }
    setLoading(true); setError(null);
    try {
      const { company } = await api.addCompany(ticker, sector);
      onAdded(company);
      setOpen(false); setTicker("");
    } catch (e: any) {
      setError(e.message?.includes("409") ? "이미 등록된 기업입니다" : e.message?.includes("404") ? "종목코드를 찾을 수 없습니다" : "추가에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button onClick={()=>setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
        <Plus size={13}/> 기업 추가
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-50 bg-card border border-border rounded-xl shadow-2xl w-64 p-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">종목코드로 추가</p>
          <input type="text" placeholder="예: 011170" value={ticker} onChange={e=>setTicker(e.target.value.trim())}
            className="w-full px-3 py-2 text-[12px] bg-background border border-border rounded-lg outline-none focus:border-blue-400/60 transition-colors mb-2"/>
          <select value={sector} onChange={e=>setSector(e.target.value)}
            className="w-full px-3 py-2 text-[12px] bg-background border border-border rounded-lg outline-none mb-2">
            {SECTORS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}
          <button onClick={submit} disabled={loading}
            className="w-full px-3 py-2 text-[12px] font-semibold rounded-lg text-white shadow-sm disabled:opacity-50"
            style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)"}}>
            {loading?"DART에서 조회 중…":"추가"}
          </button>
          <p className="text-[10px] text-muted-foreground mt-2">추가 즉시 DART 데이터를 조회해 반영합니다 (몇 초 소요)</p>
        </div>
      )}
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────────────────────

function DashboardView({ companies, onSelectCompany, onAddToCompare, compareIds, watchIds, toggleWatch, user, onCompanyAdded }: {
  companies:Company[]; onSelectCompany:(c:Company)=>void; onAddToCompare:(id:number)=>void;
  compareIds:number[]; watchIds:number[]; toggleWatch:(id:number)=>void;
  user:ApiUser|null; onCompanyAdded:(c:Company)=>void;
}) {
  const [filters,setFilters]=useState<Filters>({search:"",sectors:[],riskLevels:[],sortBy:"score",sortDir:"desc"});

  const filtered=useMemo(()=>{
    let list=[...companies];
    if(filters.search){const q=filters.search.toLowerCase();list=list.filter(c=>c.name.toLowerCase().includes(q)||c.ticker.includes(q));}
    if(filters.sectors.length) list=list.filter(c=>filters.sectors.includes(c.sector));
    if(filters.riskLevels.length) list=list.filter(c=>filters.riskLevels.includes(getRisk(c.score)));
    list.sort((a,b)=>{
      let av=0,bv=0;
      if(filters.sortBy==="score"){av=a.score;bv=b.score;}
      else if(filters.sortBy==="marketCap"){av=a.marketCap??0;bv=b.marketCap??0;}
      else{av=a.lastDisclosure?new Date(a.lastDisclosure).getTime():0;bv=b.lastDisclosure?new Date(b.lastDisclosure).getTime():0;}
      return filters.sortDir==="desc"?bv-av:av-bv;
    });
    return list;
  },[filters, companies]);

  return (
    <div className="flex h-full overflow-hidden flex-col">
      <KPIStrip companies={companies}/>
      <div className="flex flex-1 overflow-hidden">
        <FilterPanel filters={filters} setFilters={setFilters}/>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-2.5 border-b border-border/60 flex items-center gap-2.5 flex-shrink-0 bg-card/20">
            <span className="text-[11px] text-muted-foreground flex-1">
              <span className="font-mono font-semibold text-foreground">{filtered.length}</span>개 · 기준일 {ANALYSIS_DATE} · {ANALYSIS_VER}
            </span>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input type="text" placeholder="기업명 · 종목코드" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}
                className="pl-8 pr-3 py-1.5 text-[12px] bg-muted/60 rounded-lg border border-border/40 outline-none w-40 placeholder:text-muted-foreground focus:border-blue-400/50 transition-colors"/>
            </div>
            <div className="w-px h-5 bg-border/60"/>
            <AddCompanyForm user={user} onAdded={onCompanyAdded}/>
            <button onClick={()=>exportCSV(filtered)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <FileSpreadsheet size={13}/> CSV
            </button>
            <button onClick={()=>window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Printer size={13}/> 인쇄
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10">
                <tr style={{background:"var(--card)",boxShadow:"0 1px 0 var(--border)"}}>
                  {["#","기업명","업종","시총","위험 스코어 / 전일대비","핵심 Red Flags","추이","공시일","비교","관심"].map(h=>(
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap first:pl-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c,idx)=>{
                  const lv=getRisk(c.score);
                  const isWatched=watchIds.includes(c.id);
                  return (
                    <tr key={c.id} onClick={()=>onSelectCompany(c)}
                      className="border-b border-border/40 cursor-pointer transition-colors hover:bg-muted/30"
                      style={{borderLeft:`3px solid ${riskConfig[lv].rowBorder}`}}>
                      <td className="pl-4 pr-2 py-3 text-muted-foreground font-mono text-[11px]">{idx+1}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[13px] leading-none">{c.name}</p>
                        <p className="text-muted-foreground font-mono text-[10px] mt-0.5">{c.ticker}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full flex-shrink-0" style={{background:SECTOR_COLORS[c.sector]||"#888"}}/>
                          <span className="text-[11px] text-muted-foreground">{c.sector}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-muted-foreground text-[11px]">{fmtMarketCap(c.marketCap)}</td>
                      <td className="px-3 py-3"><ScoreBar score={c.score} prev={c.prevScore}/></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.flags.slice(0,2).map(f=><FlagTag key={f} label={f}/>)}
                          {c.flags.length>2&&<span className="text-[10px] text-muted-foreground font-mono">+{c.flags.length-2}</span>}
                          {c.flags.length===0&&<span className="text-[11px] text-emerald-500 font-medium">없음</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.scoreTrend==="up"&&<TrendingUp size={13} className="inline text-red-400"/>}
                        {c.scoreTrend==="down"&&<TrendingDown size={13} className="inline text-emerald-500"/>}
                        {c.scoreTrend==="stable"&&<Minus size={13} className="inline text-muted-foreground"/>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-[10px] whitespace-nowrap">{fmtDate(c.lastDisclosure)}</td>
                      <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>onAddToCompare(c.id)}
                          className={`size-7 rounded-lg flex items-center justify-center transition-all ${compareIds.includes(c.id)?"bg-blue-500 text-white shadow-sm shadow-blue-500/30":"hover:bg-muted text-muted-foreground"}`}>
                          <Plus size={12}/>
                        </button>
                      </td>
                      <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>toggleWatch(c.id)}
                          className={`size-7 rounded-lg flex items-center justify-center transition-all ${isWatched?"text-amber-500":"text-muted-foreground hover:text-amber-400"}`}>
                          {isWatched?<BookmarkCheck size={13}/>:<Bookmark size={13}/>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length===0&&(
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <Building2 size={36} className="mb-3 opacity-20"/>
                <p className="text-[13px]">조건에 맞는 기업이 없습니다</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Watch List View ───────────────────────────────────────────────────────────

function WatchListView({ companies, watchIds, toggleWatch, onSelectCompany }: {
  companies:Company[]; watchIds:number[]; toggleWatch:(id:number)=>void; onSelectCompany:(c:Company)=>void;
}) {
  const watched = companies.filter(c=>watchIds.includes(c.id)).sort((a,b)=>Math.abs(b.score-b.prevScore)-Math.abs(a.score-a.prevScore));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 bg-card/30 flex items-center gap-4">
        <div>
          <h1 className="text-[15px] font-bold">워치리스트</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {ANALYSIS_DATE} 모닝 브리핑 · <span className="font-mono font-semibold text-foreground">{watched.length}</span>개 기업 추적 중
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>exportCSV(watched)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground">
            <FileSpreadsheet size={13}/> CSV
          </button>
          <button onClick={()=>window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground">
            <Printer size={13}/> 인쇄
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {watched.length===0?(
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="size-20 rounded-2xl bg-muted/40 flex items-center justify-center mb-4"><Bookmark size={28} className="opacity-25"/></div>
            <p className="text-[14px] font-medium text-foreground mb-1">관심 기업이 없습니다</p>
            <p className="text-[12px]">스크리닝 목록에서 <BookmarkCheck size={11} className="inline"/> 버튼을 눌러 워치리스트에 추가하세요</p>
          </div>
        ):(
          <>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-3">전일 대비 변동 · 위험도 순</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
              {watched.map(c=>{
                const lv=getRisk(c.score), delta=c.score-c.prevScore;
                const dartUrl=dartFilingUrl(c.dartNo);
                return (
                  <div key={c.id} className="border border-border/60 rounded-xl bg-card shadow-sm overflow-hidden hover:border-border hover:shadow-md transition-all cursor-pointer"
                    style={{borderLeft:`3px solid ${riskConfig[lv].rowBorder}`}}
                    onClick={()=>onSelectCompany(c)}>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[14px] font-bold">{c.name}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${riskConfig[lv].badgeCls}`}>{riskConfig[lv].label}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">{c.ticker} · {c.sector}</p>
                        </div>
                        <button onClick={e=>{e.stopPropagation();toggleWatch(c.id);}} className="text-amber-500 hover:text-amber-400 transition-colors">
                          <BookmarkCheck size={16}/>
                        </button>
                      </div>

                      <div className="flex items-end gap-4 mb-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">현재 스코어</p>
                          <p className="text-[32px] font-bold font-mono leading-none" style={{color:riskConfig[lv].arc}}>{c.score}</p>
                        </div>
                        <div className="pb-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">전일 대비</p>
                          <div className={`text-[22px] font-bold font-mono leading-none flex items-center gap-1 ${delta>0?"text-red-500":delta<0?"text-emerald-500":"text-muted-foreground"}`}>
                            {delta>0?<TrendingUp size={18}/>:delta<0?<TrendingDown size={18}/>:<Minus size={18}/>}
                            {delta>0?"+":""}{delta}
                          </div>
                        </div>
                        <div className="pb-1 ml-auto text-right">
                          <p className="text-[10px] text-muted-foreground mb-0.5">전일</p>
                          <p className="text-[16px] font-mono text-muted-foreground">{c.prevScore}</p>
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden mb-3">
                        <div className="h-full rounded-full" style={{width:`${c.score}%`,background:riskConfig[lv].arc}}/>
                      </div>

                      <div className="flex flex-wrap gap-1 mb-3">
                        {c.flags.slice(0,3).map(f=><FlagTag key={f} label={f}/>)}
                        {c.flags.length===0&&<span className="text-[11px] text-emerald-500 font-medium">Red Flag 없음</span>}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                        <div className="text-[10px] text-muted-foreground">
                          <span className="font-mono">{fmtDate(c.lastDisclosure)}</span> · {c.auditor ?? "감사인 정보 없음"}
                        </div>
                        {dartUrl && (
                          <a href={dartUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e=>e.stopPropagation()}
                            className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-400 transition-colors font-medium">
                            DART <ExternalLink size={10}/>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Red Flag Card ─────────────────────────────────────────────────────────────

function RedFlagCard({ flag }: { flag:AiFlag }) {
  const [hover,setHover]=useState(false);
  const cfg=severityConfig[flag.severity];
  return (
    <div className="relative border border-border/60 rounded-xl bg-card shadow-sm overflow-visible cursor-default transition-all hover:border-border hover:shadow-md"
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${cfg.stripe}`}/>
      <div className="pl-4 pr-4 pt-3.5 pb-3.5 ml-1">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cfg.pill}`}>{cfg.label}</span>
          <span className="text-[12px] font-semibold">{flag.tag}</span>
        </div>
        <p className="text-[12px] text-foreground/75 leading-relaxed">{flag.summary}</p>
      </div>
      {hover&&(
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-card border border-border rounded-xl p-4 shadow-2xl">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">산출 근거</p>
          <p className="text-[12px] leading-relaxed border-l-2 border-blue-400 pl-3 text-foreground/85 font-mono">{flag.basis}</p>
        </div>
      )}
    </div>
  );
}

// ── News Tab (기사분석) ───────────────────────────────────────────────────────

const NEWS_CATEGORIES = ["소송","지급보증","약정사항","특수관계자"] as const;

function NewsTab({ companyId }: { companyId: number }) {
  const [news, setNews] = useState<Record<string, NewsArticle[]> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setNews(null); setError(false);
    api.getCompanyNews(companyId).then(setNews).catch(() => setError(true));
  }, [companyId]);

  if (error) {
    return <div className="flex items-center justify-center py-20 text-[12px] text-muted-foreground">기사를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>;
  }
  if (news === null) {
    return <div className="flex items-center justify-center py-20 text-[12px] text-muted-foreground">최근 6개월 기사를 검색하는 중…</div>;
  }

  const total = NEWS_CATEGORIES.reduce((s, c) => s + (news[c]?.length ?? 0), 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40">
        <Newspaper size={13} className="text-blue-500 flex-shrink-0"/>
        <p className="text-[12px] text-blue-700 dark:text-blue-400">
          최근 6개월 언론 보도를 카테고리별로 검색한 결과입니다 (총 {total}건) · 출처 링크로 원문을 확인하세요 · 검색 기반 수집이므로 무관한 기사가 섞일 수 있습니다
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {NEWS_CATEGORIES.map(category => {
          const articles = news[category] ?? [];
          return (
            <div key={category} className="border border-border/60 rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                <span className="text-[12px] font-semibold">{category}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{articles.length}건</span>
              </div>
              {articles.length === 0 ? (
                <p className="px-4 py-6 text-[12px] text-muted-foreground text-center">최근 6개월 내 관련 기사가 없습니다</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {articles.map((a, i) => (
                    <li key={i}>
                      <a href={a.link} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-muted/30 transition-colors">
                        <p className="text-[12px] leading-snug mb-1">{a.title}</p>
                        <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
                          {a.source && <span>{a.source}</span>}
                          {a.publishedAt && <span>· {fmtDate(a.publishedAt)}</span>}
                          <ExternalLink size={9} className="inline"/>
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail View ───────────────────────────────────────────────────────────────

function DetailView({ company, onBack, isWatched, toggleWatch }: {
  company:Company; onBack:()=>void; isWatched:boolean; toggleWatch:()=>void;
}) {
  const [tab,setTab]=useState<"quant"|"ai"|"news"|"report">("quant");
  const [showBreakdown,setShowBreakdown]=useState(false);
  const lv=getRisk(company.score);
  const latestD=company.debtRatio.at(-1)?.value??null;
  const latestO=company.opMargin.at(-1)?.value??null;
  const dartUrl=dartFilingUrl(company.dartNo);

  return (
    <motion.div initial={{x:"100%"}} animate={{x:0}} transition={{type:"spring",damping:34,stiffness:360}}
      className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-border/60 flex items-center gap-2 bg-card/40 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={13}/> 스크리닝 목록
        </button>
        <ChevronRight size={11} className="text-muted-foreground"/>
        <span className="text-[12px] font-medium">{company.name}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ml-1 ${riskConfig[lv].badgeCls}`}>{riskConfig[lv].label}</span>
        <div className="ml-auto flex items-center gap-2">
          {dartUrl && (
            <a href={dartUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-blue-500 hover:text-blue-400">
              <ExternalLink size={12}/> DART 공시
            </a>
          )}
          <button onClick={()=>setShowBreakdown(!showBreakdown)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${showBreakdown?"bg-primary text-primary-foreground border-primary":"border-border hover:bg-muted text-muted-foreground"}`}>
            <BarChart3 size={12}/> 산출 근거
          </button>
          <button onClick={toggleWatch} className={`size-8 rounded-lg border flex items-center justify-center transition-all ${isWatched?"border-amber-400 text-amber-500 bg-amber-50 dark:bg-amber-950/20":"border-border text-muted-foreground hover:text-amber-500 hover:border-amber-400"}`}>
            {isWatched?<BookmarkCheck size={14}/>:<Bookmark size={14}/>}
          </button>
          <button onClick={()=>window.print()} className="size-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <Printer size={13}/>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="border-b border-border/60" style={{background:`linear-gradient(135deg,${riskConfig[lv].arc}08 0%,transparent 60%)`}}>
          <div className="px-6 py-5 flex items-start gap-8">
            <div className="flex-shrink-0"><ScoreGauge score={company.score}/></div>
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-xl font-bold tracking-tight">{company.name}</h2>
                <span className="font-mono text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">{company.ticker}</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-lg mb-3">{company.description}</p>
              <div className="grid grid-cols-2 gap-2 max-w-xs mb-3">
                {[
                  { label:"부채비율", value:latestD==null?"데이터 부족":`${latestD}%`, good:latestD!=null&&latestD<100, bad:latestD!=null&&latestD>200 },
                  { label:"영업이익률", value:latestO==null?"데이터 부족":`${latestO.toFixed(1)}%`, good:latestO!=null&&latestO>10, bad:latestO!=null&&latestO<0 },
                ].map(({label,value,good,bad})=>(
                  <div key={label} className="rounded-lg border border-border/50 p-2.5 bg-card/60">
                    <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                    <p className={`text-[14px] font-mono font-semibold ${good?"text-emerald-500":bad?"text-red-500":""}`}>{value}</p>
                  </div>
                ))}
              </div>
              {/* Audit trail */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Info size={11}/> {company.fiscalYear??"—"}</span>
                <span className="font-mono">공시번호 {company.dartNo??"정보 없음"}</span>
                <span>감사인: <span className="font-medium text-foreground">{company.auditor??"정보 없음"}</span></span>
                <span>분석 기준일: <span className="font-mono text-foreground">{ANALYSIS_DATE}</span></span>
                <span>버전: <span className="font-mono text-foreground">{ANALYSIS_VER}</span></span>
                <span className={`font-semibold flex items-center gap-1 ${company.score>company.prevScore?"text-red-500":company.score<company.prevScore?"text-emerald-500":"text-muted-foreground"}`}>
                  전일({company.prevScore}) → 당일({company.score}) <Delta curr={company.score} prev={company.prevScore}/>
                </span>
              </div>
            </div>
          </div>
        </div>

        {showBreakdown&&(
          <div className="px-6 py-4 border-b border-border/60">
            <ScoreBreakdownPanel company={company} onClose={()=>setShowBreakdown(false)}/>
          </div>
        )}

        <div className="border-b border-border/60 px-6 bg-card/20">
          <div className="flex">
            {([{id:"quant" as const,label:"정량 지표"},{id:"ai" as const,label:"AI 정성 분석"},{id:"news" as const,label:"기사분석"},{id:"report" as const,label:"보고서 정보"}]).map(({id,label})=>(
              <button key={id} onClick={()=>setTab(id)}
                className={`px-5 py-3.5 text-[12px] border-b-2 transition-all font-medium ${tab===id?"border-blue-500 text-blue-500":"border-transparent text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab==="quant"&&(
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              <MetricAreaChart title="매출액 (억원)" data={company.revenue} color="#3b82f6"/>
              <MetricAreaChart title="부채비율 (%)" data={company.debtRatio} color="#ef4444" refVal={100} refLabel="100%"/>
              <MetricAreaChart title="영업이익률 (%)" data={company.opMargin} color="#10b981" refVal={0} refLabel="BEP"/>
              <MetricAreaChart title="유동비율 (%)" data={company.currentRatio} color="#8b5cf6" refVal={100} refLabel="100%"/>
              <div className="border border-border/60 rounded-xl p-4 bg-card shadow-sm">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">지표 해석</p>
                <div className="space-y-2.5 text-[11px]">
                  {[
                    { name:"부채비율", desc:"부채총계÷자본총계. 100% 이하 양호 · 200% 초과 고위험 · 음수는 자본잠식", color:"#ef4444" },
                    { name:"영업이익률", desc:"영업이익÷매출액. 0% 미만 시 손실 구간 진입", color:"#10b981" },
                    { name:"유동비율", desc:"유동자산÷유동부채. 100% 미만이면 1년 내 상환 부채가 유동자산 초과", color:"#8b5cf6" },
                  ].map(({name,desc,color})=>(
                    <div key={name} className="flex items-start gap-2">
                      <span className="font-mono font-semibold w-24 flex-shrink-0 mt-px" style={{color}}>{name}</span>
                      <span className="text-muted-foreground leading-relaxed">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab==="ai"&&(
            <div>
              {company.aiFlags.length===0?(
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <div className="size-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4"><CheckCircle2 size={28} className="text-emerald-500"/></div>
                  <p className="text-[14px] font-medium text-foreground mb-1">Red Flag 미감지</p>
                  <p className="text-[12px]">AI가 유의미한 부실 징후를 발견하지 않았습니다</p>
                </div>
              ):(
                <>
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0"/>
                    <p className="text-[12px] text-amber-700 dark:text-amber-400">카드에 마우스를 올려 스코어 산출 근거(실제 계산 수치)를 확인하세요</p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {company.aiFlags.map(f=><RedFlagCard key={f.id} flag={f}/>)}
                  </div>
                </>
              )}
            </div>
          )}

          {tab==="news"&&<NewsTab companyId={company.id}/>}

          {tab==="report"&&(
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="p-4 rounded-xl border border-border/60 bg-card shadow-sm">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">보고서 · 감사 정보</p>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">감사인</span><span className="font-medium">{company.auditor??"정보 없음"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">대상 보고서</span><span className="font-medium">{company.fiscalYear??"—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">공시 접수일</span><span className="font-mono font-medium">{fmtDate(company.lastDisclosure)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">DART 공시번호</span>
                      {dartUrl ? (
                        <a href={dartUrl} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-blue-500 hover:text-blue-400 flex items-center gap-1">{company.dartNo} <ExternalLink size={10}/></a>
                      ) : <span className="font-mono text-muted-foreground">정보 없음</span>}
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">분석 기준일</span><span className="font-mono font-medium">{ANALYSIS_DATE}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">버전</span><span className="font-mono font-medium">{ANALYSIS_VER}</span></div>
                  </div>
                </div>
              </div>
              {company.ownership.length>0&&(
                <div>
                  <h3 className="text-[13px] font-semibold mb-3">주주 구성</h3>
                  <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-[12px]">
                      <thead><tr className="border-b border-border/60 bg-muted/40">
                        {["주주","구분","지분율"].map(h=><th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {company.ownership.map((o,i)=>(
                          <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-medium">{o.entity}</td>
                            <td className="px-4 py-3"><span className="text-[10px] px-1.5 py-px rounded border border-border/60 bg-muted/50 text-muted-foreground">{o.type}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-blue-500" style={{width:`${Math.min(o.share*1.5,100)}%`}}/>
                                </div>
                                <span className="font-mono text-[12px] font-medium">{o.share}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Compare View ──────────────────────────────────────────────────────────────

function CompareView({ allCompanies, compareIds, setCompareIds }: { allCompanies:Company[]; compareIds:number[]; setCompareIds:(ids:number[])=>void }) {
  const [search,setSearch]=useState("");
  const companies=allCompanies.filter(c=>compareIds.includes(c.id));
  const suggestions=allCompanies.filter(c=>!compareIds.includes(c.id)&&(c.name.includes(search)||c.ticker.includes(search))).slice(0,5);

  const metrics: { label:string; fmt:(c:Company)=>string|number; highlight:"high"|"low"|null }[] = [
    { label:"위험 스코어", fmt:c=>c.score, highlight:"high" },
    { label:"업종", fmt:c=>c.sector, highlight:null },
    { label:"시가총액", fmt:c=>fmtMarketCap(c.marketCap), highlight:null },
    { label:"부채비율 (%)", fmt:c=>c.debtRatio.at(-1)?.value??"—", highlight:"high" },
    { label:"영업이익률 (%)", fmt:c=>c.opMargin.at(-1)?.value.toFixed(1)??"—", highlight:"low" },
    { label:"유동비율 (%)", fmt:c=>c.currentRatio.at(-1)?.value.toFixed(0)??"—", highlight:"low" },
    { label:"Red Flag 수", fmt:c=>c.flags.length, highlight:"high" },
    { label:"감사인", fmt:c=>c.auditor, highlight:null },
    { label:"최근 공시일", fmt:c=>fmtDate(c.lastDisclosure), highlight:null },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 bg-card/30 flex items-center gap-4">
        <div>
          <h1 className="text-[15px] font-bold">비교 분석</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">최대 4개 기업 나란히 비교 · 기준일 {ANALYSIS_DATE}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>exportCSV(companies)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted transition-colors text-muted-foreground">
            <FileSpreadsheet size={13}/> CSV
          </button>
          {compareIds.length<4&&(
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input type="text" placeholder="기업 추가..." value={search} onChange={e=>setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-[12px] bg-muted/60 rounded-lg border border-border/40 outline-none w-40 placeholder:text-muted-foreground focus:border-blue-400/50 transition-colors"/>
              {search&&(
                <div className="absolute top-9 right-0 z-50 bg-card border border-border rounded-xl shadow-2xl w-52 overflow-hidden">
                  {suggestions.length===0?<p className="px-4 py-3 text-[12px] text-muted-foreground">결과 없음</p>
                    :suggestions.map(c=>(
                      <button key={c.id} onClick={()=>{setCompareIds([...compareIds,c.id]);setSearch("");}}
                        className="w-full text-left px-4 py-2.5 text-[12px] hover:bg-muted transition-colors flex items-center justify-between">
                        <span className="font-medium">{c.name}</span><ScoreBadge score={c.score}/>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {companies.length===0?(
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
          <div className="size-20 rounded-2xl bg-muted/40 flex items-center justify-center mb-4"><GitCompare size={32} className="opacity-25"/></div>
          <p className="text-[14px] font-medium text-foreground mb-1">비교할 기업을 추가하세요</p>
        </div>
      ):(
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px] min-w-[700px]">
            <thead className="sticky top-0 z-10">
              <tr style={{background:"var(--card)",boxShadow:"0 1px 0 rgba(0,0,0,0.06)"}}>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-36">지표</th>
                {companies.map(c=>(
                  <th key={c.id} className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div><p className="text-[13px] font-bold">{c.name}</p><p className="text-[10px] text-muted-foreground font-mono">{c.ticker}</p></div>
                      <button onClick={()=>setCompareIds(compareIds.filter(id=>id!==c.id))} className="text-muted-foreground hover:text-foreground ml-1 transition-colors"><X size={12}/></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(({ label, fmt, highlight })=>{
                const vals=companies.map(c=>({ c, val:fmt(c) }));
                const nums=vals.map(v=>Number(v.val)).filter(n=>!isNaN(n));
                const best=highlight==="high"?Math.max(...nums):Math.min(...nums);
                const worst=highlight==="high"?Math.min(...nums):Math.max(...nums);
                return (
                  <tr key={label} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-muted-foreground font-semibold text-[11px] uppercase tracking-wide">{label}</td>
                    {vals.map(({ c, val })=>{
                      const num=Number(val), isNum=!isNaN(num)&&highlight!==null;
                      const isWorst=isNum&&num===worst, isBest=isNum&&num===best&&num!==worst;
                      return (
                        <td key={c.id} className="px-4 py-3.5 text-center">
                          {label==="위험 스코어"?<ScoreBadge score={c.score}/>
                            :<span className={`font-mono text-[12px] ${isWorst?"text-red-500 font-semibold":isBest?"text-emerald-500 font-semibold":""}`}>{val}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="border-b border-border/40 bg-muted/20">
                <td className="px-5 py-3.5 text-muted-foreground font-semibold text-[11px] uppercase tracking-wide">Red Flags</td>
                {companies.map(c=>(
                  <td key={c.id} className="px-4 py-3.5 text-center">
                    <div className="flex flex-wrap gap-1 justify-center">
                      {c.flags.slice(0,2).map(f=><FlagTag key={f} label={f}/>)}
                      {c.flags.length>2&&<span className="text-[10px] text-muted-foreground">+{c.flags.length-2}</span>}
                      {c.flags.length===0&&<span className="text-[11px] text-emerald-500 font-medium">없음</span>}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Alerts View ───────────────────────────────────────────────────────────────

interface Alert { id:number; type:"score"|"disclosure"; target:string; threshold?:number; channel:"email"|"slack"; active:boolean }

function AlertsView({ user }: { user: ApiUser | null }) {
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [form,setForm]=useState({ type:"score" as "score"|"disclosure", target:"", threshold:"70", channel:"email" as "email"|"slack" });
  const [showForm,setShowForm]=useState(false);

  useEffect(()=>{
    if(!user){ setAlerts([]); return; }
    api.getAlerts().then(rows=>setAlerts(rows.map((a:any)=>({ id:a.id, type:a.type, target:a.target, threshold:a.threshold??undefined, channel:a.channel, active:a.active })))).catch(()=>{});
  },[user]);

  const addAlert=async ()=>{
    if(!form.target) return;
    const created = await api.createAlert({ type:form.type, target:form.target, threshold:form.type==="score"?Number(form.threshold):undefined, channel:form.channel });
    setAlerts(prev=>[...prev,{ id:created.id, type:created.type, target:created.target, threshold:created.threshold??undefined, channel:created.channel, active:created.active }]);
    setForm({ type:"score", target:"", threshold:"70", channel:"email" });
    setShowForm(false);
  };

  const toggle=async (id:number)=>{
    await api.toggleAlert(id);
    setAlerts(alerts.map(x=>x.id===id?{...x,active:!x.active}:x));
  };
  const remove=async (id:number)=>{
    await api.deleteAlert(id);
    setAlerts(alerts.filter(x=>x.id!==id));
  };

  if(!user){
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Bell size={28} className="opacity-30"/>
        <p className="text-[13px]">알림 설정은 Google 로그인이 필요합니다</p>
        <a href={api.loginUrl} className="px-4 py-2 text-[12px] font-semibold rounded-lg text-white shadow-sm" style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)"}}>Google로 로그인</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 bg-card/30 flex items-center gap-4">
        <div><h1 className="text-[15px] font-bold">알림 설정</h1><p className="text-[12px] text-muted-foreground mt-0.5">조건 충족 시 이메일 또는 슬랙으로 알림 수신</p></div>
        <button onClick={()=>setShowForm(!showForm)} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white shadow-sm" style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)"}}>
          <Plus size={13}/> 알림 추가
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 space-y-3">
        {showForm&&(
          <div className="border border-blue-200/60 dark:border-blue-800/40 rounded-xl p-5 bg-blue-50/40 dark:bg-blue-950/20 mb-6">
            <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-blue-500"/><h3 className="text-[13px] font-semibold">새 알림 조건 설정</h3></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">알림 유형</label>
                <div className="flex gap-2">
                  {(["score","disclosure"] as const).map(t=>(
                    <button key={t} onClick={()=>setForm({...form,type:t})} className={`flex-1 text-[12px] py-2 rounded-lg border transition-all font-medium ${form.type===t?"bg-blue-500 text-white border-blue-500":"border-border bg-background hover:bg-muted"}`}>
                      {t==="score"?"스코어 임계값":"신규 공시"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">알림 채널</label>
                <div className="flex gap-2">
                  {(["email","slack"] as const).map(ch=>(
                    <button key={ch} onClick={()=>setForm({...form,channel:ch})} className={`flex-1 text-[12px] py-2 rounded-lg border transition-all font-medium ${form.channel===ch?"bg-blue-500 text-white border-blue-500":"border-border bg-background hover:bg-muted"}`}>
                      {ch==="email"?"이메일":"슬랙"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">대상</label>
                <input type="text" placeholder="기업명 또는 업종" value={form.target} onChange={e=>setForm({...form,target:e.target.value})}
                  className="w-full px-3 py-2 text-[12px] bg-background border border-border rounded-lg outline-none focus:border-blue-400/60 transition-colors"/>
              </div>
              {form.type==="score"&&(
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">임계값 — <span className="font-mono text-blue-500">{form.threshold}</span> 이상</label>
                  <input type="range" min={10} max={100} step={5} value={form.threshold} onChange={e=>setForm({...form,threshold:e.target.value})} className="w-full accent-blue-500"/>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={addAlert} className="px-5 py-2 text-[12px] font-semibold rounded-lg text-white shadow-sm" style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)"}}>알림 추가</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors">취소</button>
            </div>
          </div>
        )}
        {alerts.map(a=>(
          <div key={a.id} className={`flex items-center gap-4 border rounded-xl px-5 py-4 bg-card transition-all shadow-sm ${a.active?"border-border/60":"border-border/30 opacity-50"}`}>
            <div className={`size-2.5 rounded-full flex-shrink-0 ${a.active?"bg-emerald-500 shadow-sm shadow-emerald-500/40":"bg-muted-foreground/30"}`}/>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-semibold">{a.target}</span>
                {a.type==="score"&&<span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">스코어 ≥ {a.threshold}</span>}
                {a.type==="disclosure"&&<span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">신규 공시</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">{a.channel==="email"?"📧 이메일":"💬 슬랙"} · {a.active?"활성":"비활성"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>toggle(a.id)}
                className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all font-medium ${a.active?"border-border text-muted-foreground hover:bg-muted":"bg-blue-500 text-white border-blue-500"}`}>
                {a.active?"비활성화":"활성화"}
              </button>
              <button onClick={()=>remove(a.id)}
                className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
                <Trash2 size={13}/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view,setView]=useState<ViewId>("dashboard");
  const [selectedCompanyId,setSelectedCompanyId]=useState<number|null>(null);
  const [compareIds,setCompareIds]=useState<number[]>([]);
  const [watchIds,setWatchIds]=useState<number[]>([]);
  const [dark,setDark]=useState(false);

  const [companies,setCompanies]=useState<Company[]>([]);
  const [companiesLoading,setCompaniesLoading]=useState(true);
  const [companiesError,setCompaniesError]=useState<string|null>(null);
  const [user,setUser]=useState<ApiUser|null>(null);
  const [authChecked,setAuthChecked]=useState(false);

  const selectedCompany = companies.find(c=>c.id===selectedCompanyId) ?? null;

  useEffect(()=>{
    api.getCompanies()
      // Companies whose sync never produced a score (e.g. DART corp_code
      // lookup failed) are held back from the UI entirely rather than
      // rendered with broken/NaN score widgets -- they'll appear once a
      // sync run succeeds for them.
      .then(rows=>setCompanies(rows.filter((c:Company)=>c.score!=null)))
      .catch(e=>setCompaniesError(String(e)))
      .finally(()=>setCompaniesLoading(false));
    api.getMe().then(setUser).catch(()=>setUser(null)).finally(()=>setAuthChecked(true));
  },[]);

  useEffect(()=>{
    if(!user){ setWatchIds([]); return; }
    api.getWatchlist().then(setWatchIds).catch(()=>{});
  },[user]);

  useEffect(()=>{ document.documentElement.classList.toggle("dark",dark); },[dark]);

  useEffect(()=>{
    const style=document.createElement("style");
    style.id="ds-print";
    style.textContent=`
      @media print {
        #ds-app { display: none !important; }
        #ds-print-view { display: block !important; }
        @page { size: A4 landscape; margin: 10mm; }
        body { background: white !important; }
      }
    `;
    document.head.appendChild(style);
    return ()=>document.getElementById("ds-print")?.remove();
  },[]);

  const toggleWatch=async (id:number)=>{
    if(!user){ window.location.href = api.loginUrl; return; }
    const isWatched = watchIds.includes(id);
    setWatchIds(prev=>isWatched?prev.filter(x=>x!==id):[...prev,id]); // optimistic
    try{
      if(isWatched) await api.removeWatchlist(id); else await api.addWatchlist(id);
    }catch{
      setWatchIds(prev=>isWatched?[...prev,id]:prev.filter(x=>x!==id)); // revert on failure
    }
  };
  const handleSelectCompany=(c:Company)=>{ setSelectedCompanyId(c.id); setView("detail"); };
  const handleAddToCompare=(id:number)=>setCompareIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length<4?[...prev,id]:prev);
  const handleNav=(v:ViewId)=>{ setView(v); setSelectedCompanyId(null); };

  if(companiesLoading || !authChecked){
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-[13px]">
        불러오는 중…
      </div>
    );
  }

  if(companiesError){
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-background text-muted-foreground gap-2 text-[13px]">
        <p>데이터를 불러오지 못했습니다</p>
        <p className="font-mono text-[11px] text-red-500">{companiesError}</p>
      </div>
    );
  }

  return (
    <>
      <div id="ds-app" style={{fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif"}} className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar view={view==="detail"?"dashboard":view} setView={handleNav} dark={dark} setDark={setDark} watchCount={watchIds.length} user={user}/>
        <main className="flex-1 overflow-hidden">
          {view==="dashboard"&&<DashboardView companies={companies} onSelectCompany={handleSelectCompany} onAddToCompare={handleAddToCompare} compareIds={compareIds} watchIds={watchIds} toggleWatch={toggleWatch} user={user} onCompanyAdded={c=>setCompanies(prev=>[...prev, c])}/>}
          {view==="detail"&&selectedCompany&&<DetailView company={selectedCompany} onBack={()=>handleNav("dashboard")} isWatched={watchIds.includes(selectedCompany.id)} toggleWatch={()=>toggleWatch(selectedCompany.id)}/>}
          {view==="watchlist"&&<WatchListView companies={companies} watchIds={watchIds} toggleWatch={toggleWatch} onSelectCompany={handleSelectCompany}/>}
          {view==="compare"&&<CompareView allCompanies={companies} compareIds={compareIds} setCompareIds={setCompareIds}/>}
          {view==="alerts"&&<AlertsView user={user}/>}
        </main>
      </div>
      <div id="ds-print-view" style={{display:"none"}}>
        <PrintView companies={companies}/>
      </div>
    </>
  );
}
