// Thin fetch wrapper around the DealScreener FastAPI backend. Same pattern
// role as the portfolio repo's src/lib/supabase.ts, but for a REST backend
// instead of a Supabase client (this stack has no client-side DB SDK).

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ApiUser {
  id: number;
  email: string;
  name: string | null;
}

export interface NewsArticle {
  title: string;
  link: string;
  source: string | null;
  publishedAt: string | null;
}

export const api = {
  getCompanies: () => request<any[]>("/api/companies"),
  getCompany: (id: number) => request<any>(`/api/companies/${id}`),
  addCompany: (ticker: string, sector: string) =>
    request<{ company: any; sync: any }>("/api/companies", {
      method: "POST",
      body: JSON.stringify({ ticker, sector }),
    }),
  removeCompany: (id: number) => request<{ status: string }>(`/api/companies/${id}`, { method: "DELETE" }),
  getCompanyNews: (id: number) => request<Record<string, NewsArticle[]>>(`/api/companies/${id}/news`),

  getMe: () => request<ApiUser | null>("/auth/me"),
  loginUrl: "/auth/google/login",
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  getWatchlist: () => request<number[]>("/api/watchlist"),
  addWatchlist: (companyId: number) =>
    request<{ status: string }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ company_id: companyId }),
    }),
  removeWatchlist: (companyId: number) =>
    request<{ status: string }>(`/api/watchlist/${companyId}`, { method: "DELETE" }),

  getAlerts: () => request<any[]>("/api/alerts"),
  createAlert: (body: { type: string; target: string; threshold?: number; channel: string }) =>
    request<any>("/api/alerts", { method: "POST", body: JSON.stringify(body) }),
  toggleAlert: (id: number) => request<any>(`/api/alerts/${id}/toggle`, { method: "PATCH" }),
  deleteAlert: (id: number) => request<{ status: string }>(`/api/alerts/${id}`, { method: "DELETE" }),
};
