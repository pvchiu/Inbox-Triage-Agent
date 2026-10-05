"""Định nghĩa tool cho Claude + hàm thực thi.

Lưu ý thiết kế: pipeline gọi list_emails (trong gmail_service) bằng code, sau đó
mỗi email được đưa cho agent riêng. Cách này rẻ, dễ debug và tránh việc một email
độc hại ảnh hưởng tới xử lý các email khác.
"""
from dataclasses import dataclass, field

from . import gmail_service

CATEGORIES = ["urgent", "later", "newsletter", "billing"]

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "label_email",
            "description": "Gắn nhãn phân loại và tóm tắt ngắn gọn cho email. PHẢI gọi đúng một lần cho mỗi email.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": CATEGORIES,
                        "description": "urgent=cần trả lời gấp; later=để sau; newsletter=newsletter/spam/quảng cáo; billing=hoá đơn/deadline",
                    },
                    "reason": {"type": "string", "description": "Lý do ngắn gọn (1 câu)"},
                    "summary": {"type": "string", "description": "Tóm tắt ý chính / hành động cần làm 1-2 câu ngắn gọn"},
                },
                "required": ["category", "reason", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_draft",
            "description": "Tạo bản nháp trả lời trong Gmail Drafts. Chỉ dùng cho email cần phản hồi (thường là urgent). KHÔNG gửi email.",
            "parameters": {
                "type": "object",
                "properties": {
                    "body": {"type": "string", "description": "Nội dung thư trả lời, cùng ngôn ngữ với thư gốc"},
                },
                "required": ["body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Tạo sự kiện lịch khi email có lịch hẹn hoặc deadline rõ ràng về thời gian.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "start": {"type": "string", "description": "ISO 8601, vd 2026-10-12T09:00:00"},
                    "end": {"type": "string", "description": "ISO 8601; nếu là deadline thì = start + 30 phút"},
                    "description": {"type": "string"},
                },
                "required": ["title", "start", "end"],
            },
        },
    },
]

TOOLS = [
    {
        "name": "label_email",
        "description": "Gắn nhãn phân loại và tóm tắt ngắn gọn cho email. PHẢI gọi đúng một lần cho mỗi email.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string", "enum": CATEGORIES,
                    "description": "urgent=cần trả lời gấp; later=để sau; "
                                   "newsletter=newsletter/spam/quảng cáo; billing=hoá đơn/deadline",
                },
                "reason": {"type": "string", "description": "Lý do ngắn gọn (1 câu)"},
                "summary": {"type": "string", "description": "Tóm tắt ý chính / hành động cần làm 1-2 câu ngắn gọn"},
            },
            "required": ["category", "reason", "summary"],
        },
    },
    {
        "name": "create_draft",
        "description": "Tạo bản nháp trả lời trong Gmail Drafts. Chỉ dùng cho email cần phản hồi "
                       "(thường là urgent). KHÔNG gửi email.",
        "input_schema": {
            "type": "object",
            "properties": {"body": {"type": "string", "description": "Nội dung thư trả lời, cùng ngôn ngữ với thư gốc"}},
            "required": ["body"],
        },
    },
    {
        "name": "create_calendar_event",
        "description": "Tạo sự kiện lịch khi email có lịch hẹn hoặc deadline rõ ràng về thời gian.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "start": {"type": "string", "description": "ISO 8601, vd 2026-10-12T09:00:00"},
                "end": {"type": "string", "description": "ISO 8601; nếu là deadline thì = start + 30 phút"},
                "description": {"type": "string"},
            },
            "required": ["title", "start", "end"],
        },
    },
]


@dataclass
class TriageResult:
    category: str | None = None
    reason: str | None = None
    summary: str | None = None
    draft_id: str | None = None
    draft_body: str | None = None
    events: list[dict] = field(default_factory=list)


def run_tool(name: str, args: dict, email: dict, result: TriageResult) -> str:
    try:
        if name == "label_email":
            if args["category"] not in CATEGORIES:
                return "Lỗi: category không hợp lệ"
            try:
                gmail_service.apply_label(email["id"], args["category"])
            except Exception:
                pass
            result.category = args["category"]
            result.reason = args.get("reason")
            result.summary = args.get("summary")
            return "ok"
        if name == "create_draft":
            if result.draft_id:
                return "Đã có bản nháp rồi"
            result.draft_id = gmail_service.create_draft(email, args["body"])
            result.draft_body = args["body"]
            return "ok, đã lưu vào Drafts"
        if name == "create_calendar_event":
            result.events.append({k: args.get(k, "") for k in ("title", "start", "end", "description")})
            return "ok, sự kiện đã được ghi nhận"
        return f"Tool không tồn tại: {name}"
    except Exception as e:  # trả lỗi cho model thay vì làm sập pipeline
        return f"Lỗi khi chạy tool: {e}"
