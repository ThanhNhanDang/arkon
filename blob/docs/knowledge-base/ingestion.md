# Knowledge Base — Pipeline Nạp Tài Liệu

## Tổng quan

Quá trình nạp tài liệu (ingestion) chạy bất đồng bộ qua arq worker. Khi admin upload file hoặc nhập URL, API tạo `Source` record và đưa job vào hàng đợi Redis. Worker nhận job và chạy pipeline 8 bước.

## Trigger

### Upload file

```http
POST /api/sources/upload
Authorization: Bearer <admin-jwt>
Content-Type: multipart/form-data

file: <binary>
title: "Quy trình onboarding 2024"           (optional)
knowledge_type_id: "uuid-of-sop-type"        (optional)
department_id: "uuid-of-hr-dept"             (optional)
```

### Nạp từ URL

```http
POST /api/sources/url
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "url": "https://internal-wiki.company.com/page",
  "title": "Wiki nội bộ",
  "knowledge_type_id": "...",
  "department_id": "..."
}
```

Cả hai đều tạo `Source` record (`status="processing"`) rồi enqueue job vào Redis qua arq.

## Pipeline 8 bước (ingest_file_task)

### Bước 1 — Upload lên MinIO (5–10%)

```
file bytes → MinIO bucket → source.minio_key
```

File được lưu dưới key `sources/{source_id}/{filename}`. Đây là bản gốc, dùng để tạo presigned download URL sau này và để re-ingest mà không cần upload lại.

### Bước 2 — Extract text + page numbers (15–30%)

Dùng thư viện phù hợp theo MIME type:

| MIME | Thư viện | Page tracking |
|------|---------|---------------|
| application/pdf | `fitz` (PyMuPDF) | ✅ Có |
| application/vnd.openxmlformats-officedocument.wordprocessingml.document | `python-docx` | ❌ Không |
| text/plain, text/markdown | Built-in | ❌ Không |
| URL (text/html) | `content_core` / requests | ❌ Không |

Kết quả: `pages_content: list[tuple[int, str]]` — danh sách `(page_number, text)`.

### Bước 3 — Extract + phân tích ảnh bằng Vision AI (35–40%)

Áp dụng với PDF có ảnh nhúng:

1. `fitz` extract ảnh raw từ từng trang
2. Upload ảnh lên MinIO (`sources/{source_id}/images/`)
3. Vision AI provider (Google Gemini Vision / OpenAI Vision) sinh caption mô tả từng ảnh
4. Tạo `ChunkImage` record với caption, page_number, image_index

Nếu không có Vision AI provider → bước này bỏ qua, ảnh vẫn lưu nhưng không có caption.

### Bước 4 — Chunk text (45–50%)

Hàm `chunk_text_with_pages()` trong `kb_service.py`:

```
Tham số:
  chunk_size = 1500 ký tự
  chunk_overlap = 150 ký tự
  
Thuật toán:
  1. Duyệt qua từng (page_number, text)
  2. Chia text tại điểm tốt nhất: "\n\n" > "\n" > ". " > " "
  3. Duy trì overlap 150 ký tự giữa các chunk liền kề
  4. Gán page_number cho từng chunk
  
Kết quả: list[dict{content, page_number, chunk_index}]
```

### Bước 5 — Inject image captions vào chunks (50%)

Hàm `map_images_to_chunks()`: với mỗi ảnh có caption, tìm chunk cùng page_number và append caption vào cuối content chunk. Giúp ảnh được index trong semantic search.

### Bước 6 — Embed từng chunk (55–70%)

```
chunk.content → Embedding Provider → vector float[768]
```

Provider được resolve qua `ProviderRegistry` từ config trong DB:
- OpenAI text-embedding-3-small (1536d, truncated to 768d)
- Google text-embedding-004 (768d)
- Ollama nomic-embed-text (768d)

Embed theo batch. Progress update sau mỗi batch.

### Bước 7 — Lưu SourceChunk + ChunkImage (75–85%)

Bulk insert vào PostgreSQL:
- `source_chunks` table: content, chunk_index, page_number, embedding (pgvector)
- `chunk_images` table: minio_key, caption, page_number, image_index, chunk_id

Cập nhật `source.full_text` = toàn bộ text đã extract.

### Bước 8 — LLM Summary + Neo4j entities (90–98%)

**Summary:**
- LLM provider tạo tóm tắt ngắn (~200 từ) từ `source.full_text[:8000]`
- Lưu vào `SourceInsight` với `insight_type="summary"`

**Neo4j entity extraction (nếu configured):**
- LLM extract entities (người, tổ chức, sản phẩm, khái niệm) từ text
- Tạo nodes + relationships trong Neo4j
- Liên kết Source node với entity nodes

Cuối bước 8: `source.status = "ready"`, `source.progress = 100`.

## Progress Tracking

```python
class ProgressTracker:
    async def update(self, progress: int, message: str):
        source.progress = progress
        source.progress_message = message
        await session.commit()
```

Frontend polling `GET /api/sources/{id}/progress` để hiển thị thanh tiến trình.

Response:
```json
{
  "status": "processing",
  "progress": 45,
  "progress_message": "Chunking text..."
}
```

## Re-ingestion

Khi admin nhấn "Re-ingest" trên tài liệu đã tồn tại:

```http
POST /api/sources/{id}/reingest
```

Pipeline:
1. Xóa toàn bộ `SourceChunk` của source này
2. Xóa toàn bộ `SourceInsight`
3. Reset `source.status = "processing"`, `progress = 0`
4. Enqueue `reingest_file_task` → đọc file từ MinIO hiện có (không upload lại)
5. Chạy lại từ Bước 2

Dùng khi: thay đổi embedding provider, cập nhật cấu hình chunking, hay fix lỗi trong quá trình nạp lần đầu.

## Xử lý lỗi

Nếu bất kỳ bước nào throw exception:
- `source.status = "error"`
- `source.progress_message` = mô tả lỗi
- Job được log bởi arq (retry theo `WorkerSettings.max_tries`)

Admin có thể xem lỗi trong knowledge table và trigger re-ingest sau khi fix config.
