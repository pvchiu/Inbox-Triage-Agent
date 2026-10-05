from googleapiclient.discovery import build

from .config import settings
from .google_auth import get_credentials


def create_event(title: str, start: str, end: str, description: str = "") -> str:
    svc = build("calendar", "v3", credentials=get_credentials(), cache_discovery=False)
    event = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start, "timeZone": settings.timezone},
        "end": {"dateTime": end, "timeZone": settings.timezone},
    }
    return svc.events().insert(calendarId="primary", body=event).execute()["id"]
