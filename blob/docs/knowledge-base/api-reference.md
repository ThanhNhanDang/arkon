# Knowledge Base — REST API Reference

Tất cả endpoints đều có prefix `/api`. Authentication dùng JWT Bearer token từ portal login.

## Authentication

```http
Authorization: Bearer <jwt-token>
```

Lấy token qua `POST /api/auth/login`. Token encode `employee_id` và `role`.

## Permission Map

| Action | Permission cần | Notes |
|--------|---------------|-------|
| Upload file | `kb.upload` | Hoặc admin |
| Upload URL | `kb.upload` | Hoặc admin |
| Edit metadata | `kb.manage` | Hoặc admin |
| Delete source | `kb.manage` | Hoặc admin |
| Re-ingest | `kb.manage` | Hoặc admin |
| List sources | Bất kỳ auth | Mọi user đăng nhập |
| Get source details | Bất kỳ auth | |
| Manage knowledge types | admin only | |

Permissions gán qua Custom Roles trong `Employees → Custom Role`.

---

## Sources API

### GET /api/sources

Liệt kê tài liệu với filters.

**Query params:**

| Param | Type | Mô tả |
|-------|------|-------|
| `status` | string | "ready" \| "processing" \| "error" \| "all" |
| `knowledge_type_id` | UUID | Filter theo type |
| `department_id` | UUID | Filter theo department |
| `search` | string | Text search trên title |
| `limit` | int | Mặc định 50 |
| `offset` | int | Pagination offset |

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "HR Policy 2024",
    "source_type": "file",
    "file_name": "hr-policy-2024.pdf",
    "url": null,
    "status": "ready",
    "progress": 100,
    "progress_message": "Done",
    "knowledge_type_id": "uuid",
    "knowledge_type_name": "HR Policy",
    "knowledge_type_color": "#4CAF50",
    "department_id": "uuid",
    "department_name": "Human Resources",
    "created_at": "2024-01-15T09:30:00Z",
    "updated_at": "2024-01-15T09:35:00Z"
  }
]
```

---

### GET /api/sources/{id}

Chi tiết đầy đủ của một tài liệu.

**Response thêm:**
```json
{
  "...",
  "summary": "Tóm tắt tài liệu do LLM tạo...",
  "chunk_count": 24,
  "download_url": "https://minio.../presigned-url",
  "full_text": "Toàn bộ text extract được..."
}
```

---

### GET /api/sources/{id}/progress

Real-time ingestion progress.

```json
{
  "status": "processing",
  "progress": 65,
  "progress_message": "Embedding chunks (batch 3/5)..."
}
```

Dùng polling mỗi 2-3 giây từ frontend khi có docs đang processing.

---

### POST /api/sources/upload

Upload file mới vào knowledge base.

**Request:** `multipart/form-data`

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `file` | File | ✅ | File upload |
| `title` | string | ❌ | Ghi đè tên file làm title |
| `knowledge_type_id` | UUID | ❌ | Gán loại tài liệu |
| `department_id` | UUID | ❌ | Giới hạn truy cập theo phòng ban |

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "title": "hr-policy-2024.pdf",
  "status": "processing",
  "progress": 0
}
```

**Errors:**
- `400` — File không được hỗ trợ
- `403` — Thiếu permission `kb.upload`

---

### POST /api/sources/url

Nạp tài liệu từ URL.

**Request:**
```json
{
  "url": "https://...",
  "title": "Title tùy chọn",
  "knowledge_type_id": "uuid",
  "department_id": "uuid"
}
```

**Response:** Giống upload, `201 Created`.

---

### PATCH /api/sources/{id}

Cập nhật metadata của tài liệu (không trigger re-ingest).

**Request:**
```json
{
  "title": "Tiêu đề mới",
  "knowledge_type_id": "uuid-or-null",
  "department_id": "uuid-or-null"
}
```

Chỉ cần gửi fields muốn thay đổi.

**Response:** `200` với source object đã cập nhật.

---

### POST /api/sources/{id}/reingest

Xóa chunks cũ và nạp lại từ file trong MinIO.

**Request:** Không có body.

**Response:** `200`
```json
{
  "message": "Re-ingestion started",
  "source_id": "uuid"
}
```

Dùng khi: thay đổi embedding provider, update chunking config, hay fix lỗi ingest.

---

### DELETE /api/sources/{id}

Xóa tài liệu và tất cả dữ liệu liên quan.

Cascade delete:
- `SourceChunk` records
- `ChunkImage` records
- `SourceInsight` records
- File trong MinIO bucket
- Node trong Neo4j (nếu có)

**Response:** `200 {"deleted": true}`

---

## Knowledge Types API

### GET /api/knowledge-types

Liệt kê tất cả types (public, không cần auth).

```json
[
  {
    "id": "uuid",
    "name": "Standard Operating Procedure",
    "slug": "sop",
    "color": "#2196F3",
    "description": "Step-by-step procedures"
  }
]
```

### POST /api/knowledge-types

Tạo type mới. **Yêu cầu admin.**

```json
{
  "name": "Legal Document",
  "slug": "legal",
  "color": "#9C27B0",
  "description": "Contracts, terms of service, compliance"
}
```

### PUT /api/knowledge-types/{id}

Cập nhật type. **Yêu cầu admin.**

### DELETE /api/knowledge-types/{id}

Xóa type. **Yêu cầu admin.** Sources đang dùng type này sẽ có `knowledge_type_id = null`.

---

## Search Preview API (Admin)

### POST /api/sources/search-preview

Test search trực tiếp từ admin portal.

**Request:**
```json
{
  "query": "quy trình nghỉ phép",
  "top_k": 5,
  "min_similarity": 0.3
}
```

**Response:**
```json
[
  {
    "source_id": "uuid",
    "source_title": "HR Policy 2024",
    "content": "Đoạn text chunk...",
    "page_number": 12,
    "similarity": 0.78,
    "chunk_index": 15
  }
]
```

Không có scope filtering — admin thấy tất cả. Dùng để kiểm tra chất lượng search sau khi upload docs.

---

## Error Codes

| Code | Ý nghĩa |
|------|---------|
| 400 | Bad request — dữ liệu không hợp lệ |
| 401 | Unauthorized — thiếu hoặc hết hạn JWT |
| 403 | Forbidden — không đủ permission |
| 404 | Not found — resource không tồn tại |
| 422 | Validation error — Pydantic validation failed |
| 500 | Internal error — xem log worker/API |
