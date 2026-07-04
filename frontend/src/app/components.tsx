// Shared presentational widgets used across views: gauges, badges, charts,
// the score-breakdown panel, red-flag card, KPI strip, sidebar, print view.

import { useState, useEffect, useRef } from "react";
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
import { api, type ApiUser } from "@/lib/api";
import type { Company, TSPoint, AiFlag, ViewId } from "./types";
import { riskConfig, severityConfig, ANALYSIS_DATE, ANALYSIS_VER } from "./constants";
import { getRisk, fmtMarketCap, fmtDate, fmtAxisValue, computeBreakdown } from "./utils";

// ── Score Gauge ───────────────────────────────────────────────────────────────

export function ScoreGauge({ score }: { score: number }) {
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

export function ScoreBadge({ score }: { score: number }) {
  const lv = getRisk(score);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono font-medium ${riskConfig[lv].badgeCls}`}>
      <span className={`size-1.5 rounded-full flex-shrink-0 ${riskConfig[lv].dot}`}/>
      {score}
    </span>
  );
}

export function Delta({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev;
  if (d === 0) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={`font-mono text-[11px] font-semibold ${d>0?"text-red-500":"text-emerald-500"}`}>
      {d>0?"+":""}{d}
    </span>
  );
}

export function ScoreBar({ score, prev }: { score: number; prev: number }) {
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

export function FlagTag({ label }: { label: string }) {
  return <span className="inline-flex text-[10px] px-1.5 py-px rounded-sm border border-border/60 bg-muted/60 text-muted-foreground whitespace-nowrap">{label}</span>;
}

export function ChartTooltip({ active, payload, label }: any) {
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

export function MetricAreaChart({ title, data, color, refVal, refLabel }: { title:string; data:TSPoint[]; color:string; refVal?:number; refLabel?:string }) {
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

export function ScoreBreakdownPanel({ company, onClose }: { company: Company; onClose: () => void }) {
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

export function PrintView({ companies }: { companies: Company[] }) {
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

export function KPIStrip({ companies }: { companies: Company[] }) {
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

export const NAV = [
  { id:"dashboard" as ViewId, label:"스크리닝", icon:LayoutDashboard },
  { id:"watchlist" as ViewId, label:"워치리스트", icon:Bookmark },
  { id:"compare"   as ViewId, label:"비교 분석",  icon:GitCompare },
  { id:"alerts"    as ViewId, label:"알림 설정",  icon:Bell },
];

export function Sidebar({ view, setView, dark, setDark, watchCount, user }: {
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


// ── Red Flag Card ─────────────────────────────────────────────────────────────

export function RedFlagCard({ flag }: { flag:AiFlag }) {
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

