// Shared domain types for the DealScreener UI. Mirrors the shape the
// backend serializer (backend/app/serializers.py) returns.

export type RiskLevel = "safe" | "warning" | "danger";
export type ViewId = "dashboard" | "detail" | "compare" | "alerts" | "watchlist";

export interface TSPoint { year: string; value: number }

export interface AiFlag {
  id: string; tag: string; severity: "high" | "medium" | "low";
  summary: string; basis: string;
}

export interface RelatedTx { date: string; type: string; amount: number; party: string; desc: string }
export interface Ownership { entity: string; share: number; type: string }

export interface Company {
  id: number; name: string; ticker: string; sector: string;
  marketCap: number | null; score: number; prevScore: number;
  scoreTrend: "up" | "down" | "stable";
  lastDisclosure: string | null; flags: string[];
  dartNo: string | null; auditor: string | null; fiscalYear: string | null;
  revenue: TSPoint[]; debtRatio: TSPoint[]; opMargin: TSPoint[]; currentRatio: TSPoint[];
  aiFlags: AiFlag[]; relatedTx: RelatedTx[]; ownership: Ownership[];
  description: string;
}

// Dashboard filter/sort state.
export interface Filters {
  search: string; sectors: string[]; riskLevels: string[];
  sortBy: "score" | "disclosure" | "marketCap"; sortDir: "desc" | "asc";
}

// Alert rule (Alerts view).
export interface Alert {
  id: number; type: "score" | "disclosure"; target: string;
  threshold?: number; channel: "email" | "slack"; active: boolean;
}
