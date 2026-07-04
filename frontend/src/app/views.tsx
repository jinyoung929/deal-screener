// Screen-level views: Dashboard (+ filters, add-company), Watchlist,
// Detail (+ news tab), Compare, Alerts. Composed from ./components widgets.

import { useState, useEffect, useMemo } from "react";
import {
  GitCompare, Bell, Search, TrendingUp, TrendingDown, Minus, X, Plus,
  ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  Building2, Trash2, Filter, BarChart3, Bookmark, BookmarkCheck, Zap,
  ExternalLink, Printer, Info, FileSpreadsheet, Newspaper
} from "lucide-react";
import { motion } from "motion/react";
import { api, type ApiUser, type NewsArticle } from "@/lib/api";
import type { Company, AiFlag, Filters, Alert } from "./types";
import { riskConfig, SECTOR_COLORS, SECTORS, ANALYSIS_DATE, ANALYSIS_VER } from "./constants";
import { getRisk, fmtMarketCap, fmtDate, fmtAmount, dartFilingUrl, exportCSV } from "./utils";
import {
  ScoreGauge, ScoreBadge, ScoreBar, Delta, FlagTag,
  MetricAreaChart, ScoreBreakdownPanel, RedFlagCard, KPIStrip,
} from "./components";

// ── Filter Panel ──────────────────────────────────────────────────────────────


export function FilterSection({ title, children }: { title:string; children:React.ReactNode }) {
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

export function FilterPanel({ filters, setFilters }: { filters:Filters; setFilters:(f:Filters)=>void }) {
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

export function AddCompanyForm({ user, onAdded }: { user: ApiUser | null; onAdded: (c: Company) => void }) {
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

export function DashboardView({ companies, onSelectCompany, onAddToCompare, compareIds, watchIds, toggleWatch, user, onCompanyAdded }: {
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

export function WatchListView({ companies, watchIds, toggleWatch, onSelectCompany }: {
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


// ── News Tab (기사분석) ───────────────────────────────────────────────────────

export const NEWS_CATEGORIES = ["소송","지급보증","약정사항","특수관계자"] as const;

export function NewsTab({ companyId }: { companyId: number }) {
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

export function DetailView({ company, onBack, isWatched, toggleWatch }: {
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

export function CompareView({ allCompanies, compareIds, setCompareIds }: { allCompanies:Company[]; compareIds:number[]; setCompareIds:(ids:number[])=>void }) {
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


export function AlertsView({ user }: { user: ApiUser | null }) {
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

