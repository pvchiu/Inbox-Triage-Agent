export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Email = {
  id: string; sender: string; subject: string; snippet: string; body: string; date: string;
  category: string | null; reason: string | null; summary: string | null; status: string;
  draft_id: string | null; draft_body: string | null;
};
export type CalEvent = { id: number; title: string; start: string; end: string; description: string };

export type StructuredRule = {
  id: string;
  field: "domain" | "email" | "subject";
  val: string;
  target: "urgent" | "billing" | "later" | "newsletter";
  active: boolean;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const api = {
  status: () => req<{ logged_in: boolean }>("/auth/status"),
  triage: (limit = 20, force = false) => req<{ message: string }>(`/triage?limit=${limit}&force=${force}`, { method: "POST" }),
  emails: () => req<Email[]>("/emails"),
  editDraft: (id: string, body: string) =>
    req<Email>(`/emails/${id}/draft`, { method: "PATCH", body: JSON.stringify({ body }) }),
  approve: (id: string) => req<Email>(`/emails/${id}/approve`, { method: "POST" }),
  events: () => req<CalEvent[]>("/events"),
  approveEvent: (id: number) => req(`/events/${id}/approve`, { method: "POST" }),
  rejectEvent: (id: number) => req(`/events/${id}/reject`, { method: "POST" }),
  getRules: () => req<{ content: string }>("/rules"),
  saveRules: (content: string) => req<{ status: string; content: string }>("/rules", { method: "POST", body: JSON.stringify({ content }) }),
  getStructuredRules: () => req<StructuredRule[]>("/rules/structured"),
  saveStructuredRules: (rules: StructuredRule[]) => req<{ status: string; rules: StructuredRule[] }>("/rules/structured", { method: "POST", body: JSON.stringify(rules) }),
  getDigest: () => req<{ digest: string }>("/digest"),
};
