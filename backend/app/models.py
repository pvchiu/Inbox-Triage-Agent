from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = mapped_column(primary_key=True)  # Gmail message id
    thread_id: Mapped[str]
    sender: Mapped[str]
    subject: Mapped[str] = mapped_column(default="")
    snippet: Mapped[str] = mapped_column(default="")
    body: Mapped[str] = mapped_column(default="")
    date: Mapped[str] = mapped_column(default="")
    category: Mapped[str | None] = mapped_column(default=None)  # urgent|later|newsletter|billing
    reason: Mapped[str | None] = mapped_column(default=None)
    summary: Mapped[str | None] = mapped_column(default=None)  # Tóm tắt ý chính 1-2 câu
    # pending -> drafted -> approved ; hoặc error
    status: Mapped[str] = mapped_column(default="pending")
    draft_id: Mapped[str | None] = mapped_column(default=None)
    draft_body: Mapped[str | None] = mapped_column(default=None)
    error: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class PendingEvent(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email_id: Mapped[str]
    title: Mapped[str]
    start: Mapped[str]  # ISO 8601
    end: Mapped[str]
    description: Mapped[str] = mapped_column(default="")
    status: Mapped[str] = mapped_column(default="pending")  # pending|created|rejected
    calendar_event_id: Mapped[str | None] = mapped_column(default=None)
