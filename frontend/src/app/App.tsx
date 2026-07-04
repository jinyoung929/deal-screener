// Root: owns app-level state (companies, auth, active view) and wires the
// views together. Presentational pieces live in ./components and ./views.

import { useState, useEffect } from "react";
import { api, type ApiUser } from "@/lib/api";
import type { Company, ViewId } from "./types";
import { Sidebar, PrintView } from "./components";
import { DashboardView, WatchListView, DetailView, CompareView, AlertsView } from "./views";

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
