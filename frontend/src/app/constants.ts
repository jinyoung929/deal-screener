// Static config: risk/severity styling, sector palette, and display labels.
// Pure data (no JSX, no logic) so every other module can import freely.

export const riskConfig = {
  safe:    { label:"안전",  badgeCls:"bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800", rowBorder:"#10b981", arc:"#10b981", dot:"bg-emerald-500", glow:"rgba(16,185,129,0.35)", kpiIcon:"bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" },
  warning: { label:"주의",  badgeCls:"bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",   rowBorder:"#f59e0b", arc:"#f59e0b", dot:"bg-amber-500",   glow:"rgba(245,158,11,0.35)",  kpiIcon:"bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
  danger:  { label:"위험",  badgeCls:"bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",               rowBorder:"#ef4444", arc:"#ef4444", dot:"bg-red-500",     glow:"rgba(239,68,68,0.4)",    kpiIcon:"bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
};

export const severityConfig = {
  high:   { label:"High", stripe:"bg-red-500",   pill:"bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800" },
  medium: { label:"Med",  stripe:"bg-amber-500", pill:"bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" },
  low:    { label:"Low",  stripe:"bg-blue-500",  pill:"bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" },
};

export const SECTOR_COLORS: Record<string, string> = {
  화학:"#8b5cf6", IT:"#3b82f6", 바이오:"#10b981", 철강:"#f59e0b",
  식품:"#f97316", 중공업:"#64748b", 반도체:"#06b6d4",
};

export const SECTORS = ["화학","IT","바이오","철강","식품","중공업","반도체","기타"];

// Display label only, not a claim about when DART data was last synced --
// each company's own lastDisclosure carries the real filing date.
export const ANALYSIS_DATE = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
export const ANALYSIS_VER = "v1.0";
