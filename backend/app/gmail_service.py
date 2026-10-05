import base64
from email.message import EmailMessage

from googleapiclient.discovery import build

from .google_auth import get_credentials

# category -> tên nhãn hiển thị trong Gmail
LABELS = {
    "urgent": "Triage/Cần trả lời gấp",
    "later": "Triage/Để sau",
    "newsletter": "Triage/Newsletter-Spam",
    "billing": "Triage/Hoá đơn-Deadline",
}
_label_cache: dict[str, str] = {}


def _svc():
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _extract_body(payload: dict) -> str:
    """Lấy text/plain; nếu không có thì rơi về text/html thô."""
    def walk(p, mime):
        if p.get("mimeType") == mime and p.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(p["body"]["data"]).decode("utf-8", "ignore")
        for part in p.get("parts", []) or []:
            r = walk(part, mime)
            if r:
                return r
        return ""
    return walk(payload, "text/plain") or walk(payload, "text/html")


def list_emails(max_results: int = 20, query: str = "in:inbox") -> list[dict]:
    svc = _svc()
    refs = svc.users().messages().list(userId="me", maxResults=max_results, q=query).execute()
    out = []
    for ref in refs.get("messages", []):
        m = svc.users().messages().get(userId="me", id=ref["id"], format="full").execute()
        h = m["payload"]["headers"]
        out.append({
            "id": m["id"],
            "thread_id": m["threadId"],
            "sender": _header(h, "From"),
            "reply_to": _header(h, "Reply-To"),
            "subject": _header(h, "Subject"),
            "date": _header(h, "Date"),
            "message_id": _header(h, "Message-ID"),
            "snippet": m.get("snippet", ""),
            "body": _extract_body(m["payload"])[:6000],
        })
    return out


def _label_id(category: str) -> str:
    name = LABELS[category]
    if not _label_cache:
        for l in _svc().users().labels().list(userId="me").execute().get("labels", []):
            _label_cache[l["name"]] = l["id"]
    if name not in _label_cache:
        created = _svc().users().labels().create(userId="me", body={"name": name}).execute()
        _label_cache[name] = created["id"]
    return _label_cache[name]


def apply_label(message_id: str, category: str) -> None:
    _svc().users().messages().modify(
        userId="me", id=message_id, body={"addLabelIds": [_label_id(category)]}
    ).execute()


def _raw_reply(email: dict, body: str) -> str:
    msg = EmailMessage()
    msg["To"] = email.get("reply_to") or email["sender"]
    subj = email.get("subject", "")
    msg["Subject"] = subj if subj.lower().startswith("re:") else f"Re: {subj}"
    if email.get("message_id"):
        msg["In-Reply-To"] = email["message_id"]
        msg["References"] = email["message_id"]
    msg.set_content(body)
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def create_draft(email: dict, body: str) -> str:
    d = _svc().users().drafts().create(
        userId="me",
        body={"message": {"raw": _raw_reply(email, body), "threadId": email["thread_id"]}},
    ).execute()
    return d["id"]


def update_draft(draft_id: str, email: dict, body: str) -> None:
    _svc().users().drafts().update(
        userId="me", id=draft_id,
        body={"message": {"raw": _raw_reply(email, body), "threadId": email["thread_id"]}},
    ).execute()
