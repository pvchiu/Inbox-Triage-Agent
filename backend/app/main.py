import os
import time
from pathlib import Path

os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # chỉ cho dev localhost (http)
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import calendar_service, gmail_service, google_auth
from .agent import triage_email
from .config import settings
from .db import SessionLocal, get_db, init_db
from .models import Email, PendingEvent

app = FastAPI(title="Inbox Triage Agent")
app.add_middleware(
    CORSMiddleware, allow_origins=[settings.frontend_url], allow_methods=["*"], allow_headers=["*"]
)


@app.on_event("startup")
def _startup():
    init_db()


def _email_dict(e: Email) -> dict:
    return {c.name: getattr(e, c.name) for c in e.__table__.columns if c.name != "body"} | {"body": e.body}


def _event_dict(ev: PendingEvent) -> dict:
    return {c.name: getattr(ev, c.name) for c in ev.__table__.columns}


# ---------- Auth ----------
@app.get("/auth/login")
def login():
    return RedirectResponse(google_auth.login_url())


@app.get("/auth/callback")
def callback(code: str):
    google_auth.handle_callback(code)
    return RedirectResponse(settings.frontend_url)


@app.get("/auth/status")
def auth_status():
    return {"logged_in": google_auth.is_logged_in()}


from .agent import fallback_rule_classification, triage_email

def _do_triage_task(limit: int = 20, force: bool = False):
    db = SessionLocal()
    try:
        raw_emails = gmail_service.list_emails(max_results=limit)
        for raw in raw_emails:
            existing = db.get(Email, raw["id"])

            # Kiểm tra xem email này có thông tin deadline / hóa đơn hay không
            is_deadline = False
            if existing and existing.category == "billing":
                is_deadline = True
            subj_lower = (raw.get("subject") or "").lower()
            body_lower = (raw.get("body") or "").lower()
            if any(k in subj_lower or k in body_lower for k in ["deadline", "hạn nộp", "hóa đơn", "hoa don", "invoice"]):
                is_deadline = True

            # Quy tắc bỏ qua (Skip logic):
            # - Khi quét thông thường (force=False): Đã có dữ liệu và không lỗi -> GIỮ NGUYÊN (Không dán nhãn lại).
            # - Khi bấm Quét lại toàn bộ (force=True): GIỮ NGUYÊN các mail bình thường, CHỈ GÁN LẠI mail có deadline.
            if existing and existing.status != "error":
                if not force:
                    continue  # Quét mới: Mail cũ giữ nguyên
                elif not is_deadline:
                    continue  # Quét lại: Mail không có deadline giữ nguyên theo yêu cầu

            # Tạo record mới hoặc dùng lại record cũ (không xóa record cũ gây lỗi mất dữ liệu)
            if not existing:
                row = Email(**{k: raw[k] for k in ("id", "thread_id", "sender", "subject", "snippet", "body", "date")})
                db.add(row)
                db.commit()
                db.refresh(row)
            else:
                row = existing

            try:
                res = triage_email(raw)
                if res and res.category:
                    row.category = res.category
                    row.reason = res.reason or "Đã phân loại thành công"
                    row.summary = res.summary or raw.get("snippet", "")
                    row.draft_id = res.draft_id
                    row.draft_body = res.draft_body
                    row.status = "drafted" if res.draft_id else "pending"
                    row.error = None
                    for ev in res.events:
                        db.add(PendingEvent(email_id=raw["id"], **ev))
                else:
                    cat, reason = fallback_rule_classification(raw)
                    row.category = cat
                    row.reason = reason
                    row.summary = raw.get("snippet", "")
                    row.status = "pending"
                    row.error = None
            except Exception as e:
                cat, reason = fallback_rule_classification(raw)
                row.category = cat
                row.reason = f"[Quy tắc tự động] {reason}"
                row.summary = raw.get("snippet", "")
                row.status = "pending"
                row.error = None

            db.commit()
            time.sleep(0.5)
    finally:
        db.close()


# ---------- Triage ----------
@app.post("/triage")
def run_triage(background_tasks: BackgroundTasks, limit: int = 20, force: bool = False):
    """Lấy email mới -> agent xử lý ngầm -> trả về ngay tức thì."""
    if not google_auth.is_logged_in():
        raise HTTPException(401, "Chưa đăng nhập Google")
    background_tasks.add_task(_do_triage_task, limit, force)
    return {"message": "Đã bắt đầu quét hòm thư ngầm"}


@app.get("/emails")
def list_db_emails(category: str | None = None, db: Session = Depends(get_db)):
    q = select(Email)
    if category:
        q = q.where(Email.category == category)
    items = [_email_dict(e) for e in db.scalars(q)]
    # Ưu tiên hiển thị: urgent (1) -> billing (2) -> later (3) -> newsletter (4) -> khác (5)
    category_priority = {"urgent": 1, "billing": 2, "later": 3, "newsletter": 4}
    items.sort(key=lambda x: (
        category_priority.get(x.get("category"), 5),
        x.get("date") or ""
    ))
    return items



class DraftUpdate(BaseModel):
    body: str


@app.patch("/emails/{email_id}/draft")
def edit_draft(email_id: str, payload: DraftUpdate, db: Session = Depends(get_db)):
    e = db.get(Email, email_id)
    if not e or not e.draft_id:
        raise HTTPException(404, "Không có bản nháp")
    gmail_service.update_draft(
        e.draft_id,
        {"sender": e.sender, "subject": e.subject, "thread_id": e.thread_id, "message_id": ""},
        payload.body,
    )
    e.draft_body = payload.body
    db.commit()
    return _email_dict(e)


@app.post("/emails/{email_id}/approve")
def approve(email_id: str, db: Session = Depends(get_db)):
    """Đánh dấu đã duyệt. Việc gửi vẫn do bạn bấm Send trong Gmail."""
    e = db.get(Email, email_id)
    if not e:
        raise HTTPException(404)
    e.status = "approved"
    db.commit()
    return _email_dict(e)


# ---------- Custom Structured Rules & Daily Digest ----------
class RuleItem(BaseModel):
    id: str
    field: str
    val: str
    target: str
    active: bool = True


def _sync_rules_to_file(rules: list[dict]):
    lines = []
    for r in rules:
        if not r.get("active", True):
            continue
        f_type = r.get("field")
        val = r.get("val", "").strip()
        target = r.get("target", "urgent")
        if not val:
            continue
        if f_type == "domain":
            lines.append(f"Email từ tên miền {val} -> Luôn phân loại là {target}")
        elif f_type == "email":
            lines.append(f"Email từ địa chỉ {val} -> Luôn phân loại là {target}")
        elif f_type == "subject":
            lines.append(f"Email có tiêu đề chứa {val} -> Luôn phân loại là {target}")

    Path("rules.json").write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")
    Path("rules.txt").write_text("\n".join(lines), encoding="utf-8")


@app.get("/rules/structured")
def get_structured_rules():
    p = Path("rules.json")
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    initial = [
        {"id": "r1", "field": "domain", "val": ".edu.vn", "target": "urgent", "active": True},
        {"id": "r2", "field": "subject", "val": "Hóa đơn", "target": "billing", "active": True},
    ]
    _sync_rules_to_file(initial)
    return initial


@app.post("/rules/structured")
def save_structured_rules(rules: list[RuleItem]):
    rules_dict = [r.dict() for r in rules]
    _sync_rules_to_file(rules_dict)
    return {"status": "ok", "rules": rules_dict}


class RulesUpdate(BaseModel):
    content: str


@app.get("/rules")
def get_rules():
    p = Path("rules.txt")
    return {"content": p.read_text(encoding="utf-8") if p.exists() else ""}


@app.post("/rules")
def save_rules(payload: RulesUpdate):
    p = Path("rules.txt")
    p.write_text(payload.content, encoding="utf-8")
    return {"status": "ok", "content": payload.content}


@app.get("/digest")
def daily_digest(db: Session = Depends(get_db)):
    emails = db.scalars(select(Email)).all()
    if not emails:
        return {"digest": "Chưa có email nào được lưu trong cơ sở dữ liệu."}

    summary_list = "\n".join([f"- [{e.category or 'khác'}] Từ: {e.sender} | Tiêu đề: {e.subject}" for e in emails[:15]])
    prompt = f"Hãy tóm tắt ngắn gọn tình hình hòm thư hằng ngày dựa trên các email sau (khoảng 3 câu tiếng Việt súc tích):\n{summary_list}"

    try:
        from openai import OpenAI
        if settings.groq_api_key and not settings.groq_api_key.startswith("gsk_YOUR"):
            client = OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")
            res = client.chat.completions.create(model="openai/gpt-oss-120b", messages=[{"role": "user", "content": prompt}])
            return {"digest": res.choices[0].message.content}
    except Exception:
        pass

    urgent_c = sum(1 for e in emails if e.category == "urgent")
    billing_c = sum(1 for e in emails if e.category == "billing")
    return {"digest": f"Hôm nay bạn có tổng cộng {len(emails)} email ({urgent_c} thư cần trả lời gấp, {billing_c} hoá đơn/deadline)."}


# ---------- Calendar ----------
@app.get("/events")
def pending_events(db: Session = Depends(get_db)):
    return [_event_dict(x) for x in db.scalars(select(PendingEvent).where(PendingEvent.status == "pending"))]


@app.post("/events/{event_id}/approve")
def approve_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.get(PendingEvent, event_id)
    if not ev:
        raise HTTPException(404)
    ev.calendar_event_id = calendar_service.create_event(ev.title, ev.start, ev.end, ev.description)
    ev.status = "created"
    db.commit()
    return _event_dict(ev)


@app.post("/events/{event_id}/reject")
def reject_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.get(PendingEvent, event_id)
    if not ev:
        raise HTTPException(404)
    ev.status = "rejected"
    db.commit()
    return _event_dict(ev)
