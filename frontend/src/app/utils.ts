// Pure helpers: risk bucketing, number/date formatting, the client-side
// score breakdown (for the "산출 근거" panel), and CSV export.

import type { Company, RiskLevel } from "./types";
import { riskConfig } from "./constants";

export const getRisk = (s: number): RiskLevel => s >= 66 ? "danger" : s >= 31 ? "warning" : "safe";

export const fmtMarketCap = (v: number | null) => v == null ? "—" : v >= 10000 ? `${(v/10000).toFixed(1)}조` : `${v.toLocaleString()}억`;
export const fmtDate = (s: string | null) => s == null ? "—" : s.replace(/-/g, ".");
export const fmtAmount = (v: number) => `${v.toLocaleString()}억원`;

// Chart Y-axis labels: real revenue figures run to 6 digits in 억원, which
// overflowed the axis area and got clipped to their trailing digits
// ("199463" rendered as "0000"-style garbage). Abbreviate to 조 instead.
export const fmtAxisValue = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v/10000).toFixed(abs >= 100000 ? 0 : 1)}조`;
  if (abs >= 1000) return `${(v/1000).toFixed(1)}천`;
  return String(v);
};

export const dartFilingUrl = (dartNo: string | null) => dartNo ? `https://dart.fss.or.kr/dsab007/main.do?rcpNo=${dartNo}` : null;

// Client-side mirror of the backend's weighted breakdown (backend/app/
// services/scoring.py compute_breakdown), used only to render the "산출
// 근거" panel. The authoritative score always comes from the backend.
export function computeBreakdown(c: Company) {
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

export function exportCSV(companies: Company[]) {
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
