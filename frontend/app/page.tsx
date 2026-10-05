"use client";
import { useCallback, useEffect, useState } from "react";
import { API, api, CalEvent, Email, StructuredRule } from "../lib/api";

const TABS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  all: { label: "Tất cả", color: "#334155", bg: "#f1f5f9", border: "#cbd5e1" },
  urgent: { label: "🔴 Cần trả lời gấp", color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
  billing: { label: "🟡 Hoá đơn / Deadline", color: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  later: { label: "🔵 Để sau", color: "#1e40af", bg: "#dbeafe", border: "#93c5fd" },
  newsletter: { label: "⚪ Newsletter / Spam", color: "#6b21a8", bg: "#f3e8ff", border: "#e9d5ff" },
};

export default function Home() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState<Email | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [digest, setDigest] = useState<string | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rules, setRules] = useState<StructuredRule[]>([]);

  // New Rule Form State
  const [newField, setNewField] = useState<"domain" | "email" | "subject">("domain");
  const [newVal, setNewVal] = useState("");
  const [newTarget, setNewTarget] = useState<"urgent" | "billing" | "later" | "newsletter">("urgent");

  const load = useCallback(async () => {
    const [e, ev] = await Promise.all([api.emails(), api.events()]);
    setEmails(e);
    setEvents(ev);
  }, []);

  useEffect(() => {
    api.status().then((s) => {
      setLoggedIn(s.logged_in);
      if (s.logged_in) load();
    }).catch(() => setLoggedIn(false));
  }, [load]);

  const run = async (force = false) => {
    setBusy(true);
    try {
      await api.triage(20, force);
      let ticks = 0;
      const timer = setInterval(async () => {
        await load();
        ticks++;
        if (ticks >= 20) {
          clearInterval(timer);
          setBusy(false);
        }
      }, 2000);
    } catch {
      setBusy(false);
    }
  };

  const fetchDigest = async () => {
    setLoadingDigest(true);
    try {
      const res = await api.getDigest();
      setDigest(res.digest);
    } finally {
      setLoadingDigest(false);
    }
  };

  const openRulesModal = async () => {
    try {
      const r = await api.getStructuredRules();
      setRules(r);
    } catch {
      setRules([]);
    }
    setShowRulesModal(true);
  };

  const handleAddRule = async () => {
    if (!newVal.trim()) return alert("Vui lòng nhập từ khóa / tên miền!");
    const item: StructuredRule = {
      id: "r_" + Date.now(),
      field: newField,
      val: newVal.trim(),
      target: newTarget,
      active: true,
    };
    const updated = [item, ...rules];
    setRules(updated);
    await api.saveStructuredRules(updated);
    setNewVal("");
  };

  const addPresetRule = async (field: "domain" | "subject", val: string, target: "urgent" | "billing" | "newsletter") => {
    const item: StructuredRule = {
      id: "r_" + Date.now(),
      field,
      val,
      target,
      active: true,
    };
    const updated = [item, ...rules];
    setRules(updated);
    await api.saveStructuredRules(updated);
  };

  const toggleRule = async (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
    setRules(updated);
    await api.saveStructuredRules(updated);
  };

  const deleteRule = async (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    await api.saveStructuredRules(updated);
  };

  const open = (e: Email) => {
    setSel(e);
    setDraft(e.draft_body ?? "");
  };

  const shown = emails
    .filter((e) => tab === "all" || e.category === tab)
    .filter((e) =>
      !searchTerm.trim() ||
      e.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.sender?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (loggedIn === null)
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontSize: 18, color: "#6366f1" }}>⌛ Đang kết nối hòm thư Gmail...</p>
      </div>
    );

  if (!loggedIn)
    return (
      <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#fff", padding: 48, borderRadius: 16, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: 420, width: "100%" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
          <h1 style={{ margin: "0 0 12px 0", color: "#1e1b4b" }}>Inbox Triage Agent</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
            Trợ lý AI thông minh tự động phân loại hòm thư Gmail, soạn nháp câu trả lời và đề xuất lịch hẹn Calendar.
          </p>
          <a href={`${API}/auth/login`}>
            <button style={{ width: "100%", padding: "14px 24px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(79, 70, 229, 0.3)" }}>
              🔑 Đăng nhập với Google
            </button>
          </a>
        </div>
      </main>
    );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      {/* Gmail-Style Top Header Bar */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          {/* Logo & Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 200 }}>
            <span style={{ fontSize: 26 }}>📧</span>
            <h1 style={{ margin: 0, fontSize: 20, color: "#1e1b4b", fontWeight: 700 }}>Gmail Triage</h1>
          </div>

          {/* Gmail-Style Search Bar */}
          <div style={{ flex: 1, maxWidth: 500, position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Tìm kiếm email, người gửi hoặc tiêu đề..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "10px 16px", borderRadius: 24, border: "1px solid #cbd5e1", background: "#f1f5f9", fontSize: 14, outline: "none" }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={fetchDigest} disabled={loadingDigest}
              style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {loadingDigest ? "⏳ Đang tạo..." : "📊 Tóm tắt hằng ngày"}
            </button>
            <button onClick={openRulesModal}
              style={{ background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ⚙️ Quy tắc riêng
            </button>
            <button onClick={() => run(false)} disabled={busy}
              style={{ background: busy ? "#94a3b8" : "#4f46e5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 2px 4px rgba(79, 70, 229, 0.2)" }}>
              {busy ? "⚡ Đang quét..." : "⚡ Quét email mới"}
            </button>
            <button onClick={() => run(true)} disabled={busy} title="Phân loại lại toàn bộ từ đầu"
              style={{ background: "#fff", color: "#64748b", border: "1px solid #cbd5e1", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}>
              🔄 Quét lại toàn bộ
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 24px" }}>
        {/* Daily Digest Alert Card */}
        {digest && (
          <div style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)", border: "1px solid #c7d2fe", borderRadius: 12, padding: 18, marginBottom: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h4 style={{ margin: 0, color: "#3730a3", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📝</span> Tóm tắt tổng quan hòm thư 24h qua (Tiếng Việt)
              </h4>
              <button onClick={() => setDigest(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6366f1", fontWeight: 600 }}>✕ Đóng</button>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "#1e1b4b", lineHeight: 1.6 }}>{digest}</p>
          </div>
        )}

        {/* Rules Ver 2 Modal */}
        {showRulesModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.5)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 24, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: "#0f172a" }}>⚙️ Quản lý Quy tắc ưu tiên (Rules Ver 2)</h3>
                <button onClick={() => setShowRulesModal(false)} style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>✕</button>
              </div>

              {/* Presets */}
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, marginBottom: 16, border: "1px solid #e2e8f0" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "#475569" }}>💡 Nút bấm tạo quy tắc nhanh (1-Click Presets):</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => addPresetRule("domain", ".edu.vn", "urgent")} style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    + Mail Giảng viên / Trường (.edu.vn ➔ Gấp)
                  </button>
                  <button onClick={() => addPresetRule("subject", "Hóa đơn", "billing")} style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    + Mail Học phí / Hóa đơn (Hóa đơn ➔ Billing)
                  </button>
                  <button onClick={() => addPresetRule("domain", "no-reply", "newsletter")} style={{ background: "#f3e8ff", color: "#6b21a8", border: "1px solid #e9d5ff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    + Mail Đăng ký / Spam (no-reply ➔ Spam)
                  </button>
                </div>
              </div>

              {/* Visual Form */}
              <div style={{ background: "#eef2ff", padding: 16, borderRadius: 10, border: "1px solid #c7d2fe", marginBottom: 20 }}>
                <p style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 700, color: "#3730a3" }}>➕ NẾU ... THÌ ... (Tạo quy tắc mới tùy chỉnh):</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 8, marginBottom: 12 }}>
                  <select value={newField} onChange={(e) => setNewField(e.target.value as any)} style={{ padding: 8, borderRadius: 6, border: "1px solid #a5b4fc" }}>
                    <option value="domain">Đuôi email chứa</option>
                    <option value="email">Địa chỉ email chứa</option>
                    <option value="subject">Tiêu đề có chứa từ</option>
                  </select>
                  <input type="text" placeholder="Gõ từ khóa/đuôi email (VD: @fpt.edu.vn)" value={newVal} onChange={(e) => setNewVal(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #a5b4fc" }} />
                  <select value={newTarget} onChange={(e) => setNewTarget(e.target.value as any)} style={{ padding: 8, borderRadius: 6, border: "1px solid #a5b4fc" }}>
                    <option value="urgent">🔴 Cần trả lời gấp</option>
                    <option value="billing">🟡 Hoá đơn / Deadline</option>
                    <option value="later">🔵 Để sau</option>
                    <option value="newsletter">⚪ Newsletter / Spam</option>
                  </select>
                </div>
                <button onClick={handleAddRule} style={{ width: "100%", padding: 10, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
                  + Thêm quy tắc này vào hệ thống
                </button>
              </div>

              {/* Rules List */}
              <h4 style={{ margin: "0 0 12px 0", color: "#0f172a" }}>📋 Danh sách quy tắc ({rules.length})</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rules.map((r) => {
                  const targetInfo = TABS[r.target] || TABS.all;
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: r.active ? "#fff" : "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", opacity: r.active ? 1 : 0.6 }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: "#334155" }}>
                          {r.field === "domain" ? "Đuôi mail" : r.field === "email" ? "Email" : "Tiêu đề"}
                        </span>{" "}
                        chứa <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, color: "#4f46e5" }}>{r.val}</code> ➔{" "}
                        <span style={{ background: targetInfo.bg, color: targetInfo.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                          {targetInfo.label}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={() => toggleRule(r.id)} style={{ background: r.active ? "#dcfce7" : "#f1f5f9", color: r.active ? "#15803d" : "#64748b", border: "none", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {r.active ? "✓ Bật" : "✕ Tắt"}
                        </button>
                        <button onClick={() => deleteRule(r.id)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "4px 8px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
                {rules.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>Chưa có quy tắc nào.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Category Filter Pills */}
        <nav style={{ display: "flex", gap: 8, margin: "0 0 16px 0", flexWrap: "wrap" }}>
          {Object.entries(TABS).map(([k, t]) => {
            const count = emails.filter((e) => k === "all" || e.category === k).length;
            const isSel = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  background: isSel ? t.bg : "#fff",
                  color: isSel ? t.color : "#475569",
                  border: `1px solid ${isSel ? t.border : "#cbd5e1"}`,
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: isSel ? 700 : 500,
                  cursor: "pointer",
                  boxShadow: isSel ? "0 2px 4px rgba(0,0,0,0.04)" : "none",
                }}>
                {t.label} ({count})
              </button>
            );
          })}
        </nav>

        {/* Main Interface: Gmail-Style List OR Email Reader View */}
        {!sel ? (
          /* GMAIL-STYLE INBOX TABLE LIST */
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700, color: "#64748b", display: "grid", gridTemplateColumns: "220px 140px 1fr 100px", gap: 12 }}>
              <span>NGƯỜI GỬI</span>
              <span>NHÃN PHÂN LOẠI</span>
              <span>TIÊU ĐỀ & TÓM TẮT THƯ</span>
              <span style={{ textAlign: "right" }}>NGÀY GỬI</span>
            </div>

            {shown.map((e) => {
              const tag = e.category && TABS[e.category] ? TABS[e.category] : { label: e.status, color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" };
              return (
                <div key={e.id} onClick={() => open(e)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 140px 1fr 100px",
                    gap: 12,
                    padding: "14px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "#fff")}>
                  {/* Sender Name */}
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <b style={{ fontSize: 14, color: "#0f172a" }}>{e.sender.split("<")[0] || e.sender}</b>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{e.sender.includes("<") ? e.sender.split("<")[1].replace(">", "") : ""}</div>
                  </div>

                  {/* Category Pill */}
                  <div>
                    <span style={{ background: tag.bg, color: tag.color, border: `1px solid ${tag.border}`, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, display: "inline-block" }}>
                      {tag.label}
                    </span>
                  </div>

                  {/* Subject & Summary Preview */}
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.subject || "(Không có tiêu đề)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.summary ? `📌 ${e.summary}` : (e.snippet || e.body).slice(0, 100)}
                    </div>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "right", whiteSpace: "nowrap" }}>
                    {e.date ? e.date.split(" ")[1] + " " + e.date.split(" ")[2] : "Mới"}
                  </div>
                </div>
              );
            })}

            {shown.length === 0 && (
              <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
                <p style={{ margin: 0 }}>Chưa có email nào trong thư mục này. Bấm "Quét email mới" để nạp thư.</p>
              </div>
            )}
          </div>
        ) : (
          /* GMAIL-STYLE FULL EMAIL READER PANEL */
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
            {/* Top Back Navigation Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid #f1f5f9", pb: 16 }}>
              <button onClick={() => setSel(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                ← Quay lại danh sách hòm thư
              </button>
              {sel.category && TABS[sel.category] && (
                <span style={{ background: TABS[sel.category].bg, color: TABS[sel.category].color, border: `1px solid ${TABS[sel.category].border}`, padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  {TABS[sel.category].label}
                </span>
              )}
            </div>

            {/* Email Subject & Sender Info */}
            <h2 style={{ margin: "0 0 12px 0", fontSize: 20, color: "#0f172a" }}>{sel.subject}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #f1f5f9" }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: "#4f46e5", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 700, fontSize: 16 }}>
                {sel.sender.charAt(0).toUpperCase()}
              </div>
              <div>
                <b style={{ fontSize: 14, color: "#0f172a" }}>{sel.sender}</b>
                <div style={{ fontSize: 12, color: "#64748b" }}>{sel.date}</div>
              </div>
            </div>

            {/* 3 VIETNAMESE AI CARDS (TL;DR) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Card 1: AI Summary in Vietnamese */}
              <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", padding: 16, borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3730a3", display: "block", marginBottom: 6 }}>📌 1. Ý CHÍNH & TÓM TẮT AI (TIẾNG VIỆT)</span>
                <p style={{ margin: 0, fontSize: 13, color: "#1e1b4b", lineHeight: 1.5 }}>
                  {sel.summary || "AI đã tóm tắt thông điệp từ người gửi."}
                </p>
              </div>

              {/* Card 2: AI Reasoning in Vietnamese */}
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: 16, borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>💬 2. LÝ DO PHÂN LOẠI (TIẾNG VIỆT)</span>
                <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
                  {sel.reason || "Phân loại tự động dựa trên từ khóa và quy tắc ưu tiên."}
                </p>
              </div>
            </div>

            {/* Card 3: AI Draft in Vietnamese */}
            {sel.draft_id ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 18, borderRadius: 10, marginBottom: 24 }}>
                <h4 style={{ margin: "0 0 10px 0", color: "#166534", fontSize: 15 }}>📝 3. BẢN NHÁP TRẢ LỜI (TIẾNG VIỆT - AI SOẠN SẴN)</h4>
                <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={7} style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #86efac", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={async () => { await api.editDraft(sel.id, draft); await load(); }} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    💾 Lưu lại vào Gmail Drafts
                  </button>
                  <button onClick={async () => { await api.approve(sel.id); await load(); }} style={{ background: "#0284c7", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    ✓ Đánh dấu đã duyệt
                  </button>
                  <a href="https://mail.google.com/mail/u/0/#drafts" target="_blank" style={{ textDecoration: "none" }}>
                    <button style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", padding: "10px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      ↗️ Mở Gmail Drafts để gửi
                    </button>
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #f1f5f9", marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: "#64748b", margin: 0, fontStyle: "italic" }}>Thư này thuộc nhóm thông tin / tin tức, không cần bản nháp trả lời.</p>
              </div>
            )}

            {/* Original Mail Body */}
            <div>
              <h4 style={{ margin: "0 0 10px 0", color: "#475569", fontSize: 13, textTransform: "uppercase" }}>📄 Nội dung thư gốc</h4>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 250, overflow: "auto", fontSize: 13, background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", color: "#334155", lineHeight: 1.6 }}>{sel.body || sel.snippet}</pre>
            </div>
          </div>
        )}

        {/* Google Calendar Events Block */}
        {events.length > 0 && (
          <div style={{ marginTop: 24, background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontSize: 16, color: "#0f172a", marginBottom: 12 }}>📅 Sự kiện lịch đề xuất từ Email ({events.length})</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {events.map((ev) => (
                <div key={ev.id} style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #cbd5e1" }}>
                  <b style={{ color: "#1e1b4b", fontSize: 14, display: "block", marginBottom: 4 }}>{ev.title}</b>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{ev.start} → {ev.end}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => { await api.approveEvent(ev.id); await load(); }} style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      + Tạo trên Google Calendar
                    </button>
                    <button onClick={async () => { await api.rejectEvent(ev.id); await load(); }} style={{ background: "#fff", color: "#64748b", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      Bỏ qua
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
