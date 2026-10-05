import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from .config import settings

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",  # đọc, gắn nhãn, tạo/sửa draft
    "https://www.googleapis.com/auth/calendar.events",
]
TOKEN_FILE = "token.json"  # MVP 1 người dùng; sau này chuyển sang DB + mã hoá


def _flow() -> Flow:
    cfg = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    return Flow.from_client_config(
        cfg, scopes=SCOPES, redirect_uri=settings.google_redirect_uri,
        autogenerate_code_verifier=False,
    )


def login_url() -> str:
    url, _ = _flow().authorization_url(access_type="offline", prompt="consent")
    return url


def handle_callback(code: str) -> None:
    flow = _flow()
    flow.fetch_token(code=code)
    with open(TOKEN_FILE, "w") as f:
        f.write(flow.credentials.to_json())


def is_logged_in() -> bool:
    return os.path.exists(TOKEN_FILE)


def get_credentials() -> Credentials:
    if not is_logged_in():
        raise RuntimeError("Chưa đăng nhập Google")
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return creds
