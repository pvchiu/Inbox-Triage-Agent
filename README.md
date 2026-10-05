# Inbox Triage Agent

Agent tự phân loại Gmail, soạn bản nháp trả lời, đề xuất sự kiện Calendar; có web để duyệt/sửa.

```
Next.js (3000)  <-->  FastAPI (8000)  <-->  Gmail API / Calendar API
                           |
                           +--> Claude API (tool use: label_email, create_draft, create_calendar_event)
                           +--> SQLite (trạng thái xử lý)
```

## 1. Chạy thử

### A. Cấu hình Google Cloud (làm 1 lần, ~20 phút)
1. console.cloud.google.com -> tạo project mới.
2. APIs & Services -> Library: bật **Gmail API** và **Google Calendar API**.
3. OAuth consent screen: chọn External, điền tên app, **thêm email của bạn vào Test users**
   (app ở chế độ Testing thì chỉ test user mới đăng nhập được, không cần xin Google duyệt).
4. Credentials -> Create OAuth client ID -> **Web application**.
   Authorized redirect URI: `http://localhost:8000/auth/callback`.
5. Copy Client ID / Secret vào `backend/.env`.

### B. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # điền key
uvicorn app.main:app --reload --port 8000
```
Mở http://localhost:8000/docs để thử API.

### C. Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install && npm run dev
```
Mở http://localhost:3000 -> Đăng nhập Google -> "Quét 20 email mới nhất".

## 2. Kế hoạch (MVP 3 ngày + mở rộng)

### Ngày 1: Nền tảng
- [ ] Cấu hình Google Cloud, lấy OAuth credentials
- [ ] Chạy được `/auth/login` và lưu token
- [ ] `gmail_service.list_emails` trả đúng 20 email (in ra console để kiểm tra)
- [ ] Tạo thử 1 draft bằng code, thấy trong Gmail Drafts
- Kết quả cuối ngày: script lấy email + tạo draft chạy được

### Ngày 2: Agent
- [ ] Hoàn thiện system prompt + tool schema trong `agent.py`, `tools.py`
- [ ] Chạy agent trên 20 email thật, ghi lại các trường hợp phân loại sai
- [ ] Chỉnh prompt/rules cho tới khi đúng ~85-90%
- [ ] Lưu kết quả vào SQLite, chạy lại không xử lý trùng
- Kết quả cuối ngày: `POST /triage` chạy end-to-end

### Ngày 3: Web + hoàn thiện
- [ ] Trang hàng chờ: tab theo nhãn, xem chi tiết, sửa nháp, duyệt
- [ ] Duyệt sự kiện Calendar
- [ ] Xử lý lỗi (token hết hạn, email rỗng, model trả lỗi)
- [ ] Quay demo + viết báo cáo/slide
- Kết quả cuối ngày: demo được toàn bộ luồng

### Mở rộng (chọn 1-2 cái, theo thứ tự ưu tiên)
1. **Rule riêng**: đã có sẵn qua `backend/rules.txt`; làm thêm trang sửa rule trên web.
2. **Tóm tắt hằng ngày**: endpoint `/digest` gọi Claude tóm tắt email 24h qua, hẹn giờ bằng APScheduler.
3. **Học phong cách viết**: lấy ~30 email trong nhãn SENT, đưa vào prompt làm ví dụ few-shot
   (hoặc trích "style guide" 1 lần rồi cache lại).
4. **Chạy nền**: dùng Gmail push notification (Pub/Sub) hoặc polling mỗi 5 phút thay vì bấm nút.
5. **Đánh giá**: tạo bộ ~50 email có nhãn đúng, đo accuracy phân loại (rất đáng đưa vào báo cáo).

## 3. Quyết định thiết kế (nên ghi vào báo cáo)

- **Agent không bao giờ gửi mail**, chỉ tạo Draft. Con người luôn là bước cuối.
- **Sự kiện lịch đề xuất trước, duyệt rồi mới tạo** (`AUTO_CREATE_EVENTS=false`), vì ngày giờ do LLM
  suy ra dễ sai.
- **Mỗi email một lượt agent riêng**: dễ debug, chi phí dễ đoán, email độc hại không ảnh hưởng email khác.
- **Chống prompt injection**: nội dung email nằm trong thẻ `<email>` và được coi là dữ liệu không đáng tin;
  agent chỉ có tool hạn chế (không có tool gửi mail).
- **Idempotent**: email đã có trong DB thì bỏ qua, quét lại không tạo draft trùng.

## 4. Lưu ý và rủi ro
- Token đang lưu ở `backend/token.json` (đủ cho MVP 1 người dùng). Đừng commit file này.
- Quét 20 email chạy đồng bộ nên mất ~30-90 giây; nếu chậm, chuyển sang `BackgroundTasks`.
- Email HTML nặng: hiện chỉ cắt 6000 ký tự đầu. Có thể thêm bước strip HTML (BeautifulSoup).
- Nếu lên nhiều người dùng: thêm bảng users, mã hoá token, và phải qua Google OAuth verification
  (scope Gmail là "restricted").
- Model mặc định: `claude-sonnet-5-5`. Đổi qua biến `MODEL` trong `.env`.

## 5. Cấu trúc thư mục
```
backend/app/
  main.py              # FastAPI routes
  agent.py             # vòng lặp tool-use với Claude
  tools.py             # schema tool + hàm thực thi
  gmail_service.py     # list_emails, label, draft
  calendar_service.py  # tạo event
  google_auth.py       # OAuth
  models.py, db.py     # SQLAlchemy
backend/rules.txt      # rule cá nhân
frontend/app/page.tsx  # trang hàng chờ duyệt
frontend/lib/api.ts    # client gọi backend
```
