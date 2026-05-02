# Knowledge Base — Tổng quan hệ thống

## Mục đích

Knowledge Base (KB) là tính năng cốt lõi của Arkon, cho phép tổ chức nạp tài liệu nội bộ (SOPs, chính sách, thông tin sản phẩm, FAQ...) vào hệ thống, rồi cấp cho nhân viên khả năng truy vấn các tài liệu đó thông qua Claude (AI assistant) theo thời gian thực — với kiểm soát phạm vi truy cập theo từng cá nhân, phòng ban, và dự án.

## Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────┐
│                        Admin Portal                          │
│           (Next.js — frontend/src/app/(portal)/)            │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                          │
│  app/routers/sources.py   app/routers/knowledge_types.py    │
└──────┬─────────────────┬──────────────────┬────────────────-┘
       │ enqueue job      │ SQL/pgvector     │ file store
       ▼                  ▼                  ▼
┌────────────┐   ┌───────────────┐   ┌──────────────┐
│ Redis/arq  │   │  PostgreSQL   │   │    MinIO     │
│ Job Queue  │   │  + pgvector   │   │ File Storage │
└─────┬──────┘   └───────┬───────┘   └──────────────┘
      │                  │
      ▼                  │ read
┌────────────┐           │
│arq Worker  │───────────┘
│ (worker.py)│
│            │──── Neo4j (entity graph, optional)
└────────────┘

                        │ MCP over HTTP
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Claude Desktop / Claude API                     │
│        (Bearer token → scoped KB access)                    │
└─────────────────────────────────────────────────────────────┘
```

## Các thành phần chính

| Thành phần | File | Vai trò |
|-----------|------|---------|
| REST API | `app/routers/sources.py` | Upload, list, edit, delete, reingest tài liệu |
| KB Service | `app/services/kb_service.py` | Logic chunk, embed, search, suggest contacts |
| arq Worker | `app/workers/worker.py` | Background pipeline nạp tài liệu bất đồng bộ |
| Vector Search | `app/database/vector_search.py` | Semantic + full-text + hybrid search |
| MCP Server | `app/mcp/tools.py` | 6 tools cho Claude Desktop |
| Auth/Scope | `app/services/mcp_auth_service.py` | Token verification + scope resolution |
| Storage | `app/services/storage_service.py` | MinIO upload/download/presigned URL |
| Graph | `app/services/neo4j_service.py` | Entity extraction, category tree (optional) |

## Luồng dữ liệu chính

### Luồng nạp tài liệu (Admin)

```
1. Admin upload file / nhập URL qua portal
        ↓
2. POST /api/sources/upload (hoặc /url)
   → Tạo Source record (status="processing")
   → Enqueue job vào Redis
        ↓
3. arq worker chạy ingest_file_task() / ingest_url_task()
   → Upload file lên MinIO
   → Extract text + page numbers
   → Vision AI phân tích ảnh (nếu có)
   → Chunk text
   → Embed từng chunk (768-dim vector)
   → Lưu SourceChunk + ChunkImage vào PostgreSQL
   → LLM tạo summary
   → Neo4j extract entities (nếu configured)
   → Source.status = "ready"
```

### Luồng truy vấn (Employee qua Claude)

```
1. Employee hỏi Claude Desktop
        ↓
2. Claude gọi search_knowledge(query="...")
   → MCP tool kiểm tra Bearer token
   → Resolve identity + scope
   → Gọi search_kb() với pgvector
   → Filter kết quả theo scope
   → Trả về formatted results
        ↓
3. Claude trả lời employee, trích dẫn nguồn
```

## Định dạng tài liệu được hỗ trợ

| Định dạng | Hỗ trợ | Ghi chú |
|-----------|--------|---------|
| PDF | ✅ Đầy đủ | Trích xuất text + page numbers + ảnh nhúng |
| DOCX | ✅ Đầy đủ | Text + bảng; không có page numbers |
| TXT / Markdown | ✅ Đầy đủ | Plain text, toàn bộ nội dung |
| URL (Web) | ✅ Đầy đủ | Fetch HTML, extract text qua content_core |
| XLSX | ⚠️ Experimental | Mỗi sheet = 1 chunk |
| PPTX | ⚠️ Experimental | Mỗi slide = 1 chunk |
| Ảnh (PNG/JPG) | ❌ Không | Chỉ xử lý ảnh nhúng trong PDF |

## Data Models

### Source — tài liệu gốc

```python
class Source(Base):
    id: UUID                    # Primary key
    title: str                  # Tiêu đề hiển thị
    source_type: str            # "file" | "url"
    status: str                 # "processing" | "ready" | "error"
    progress: int               # 0-100 (%)
    progress_message: str       # Mô tả bước đang chạy
    full_text: str              # Toàn bộ text đã extract
    file_name: str              # Tên file gốc
    minio_key: str              # Path trong MinIO bucket
    url: str                    # URL gốc (nếu source_type=url)
    knowledge_type_id: UUID     # FK → KnowledgeType
    department_id: UUID         # FK → Department (scope)
    created_at: datetime
    updated_at: datetime
```

### SourceChunk — đoạn text để search

```python
class SourceChunk(Base):
    id: UUID
    source_id: UUID             # FK → Source
    content: str                # ~1500 chars
    chunk_index: int            # Thứ tự trong document
    page_number: int            # Số trang (nếu có)
    embedding: Vector(768)      # pgvector embedding
```

### KnowledgeType — phân loại tài liệu

```python
class KnowledgeType(Base):
    id: UUID
    name: str                   # "Standard Operating Procedure"
    slug: str                   # "sop" (unique)
    color: str                  # Hex color cho UI badge
    description: str
```

Ví dụ types mặc định: `sop`, `product`, `hr-policy`, `faq`, `technical`, `legal`.

### KnowledgeScope — kiểm soát truy cập

```python
class KnowledgeScope(Base):
    id: UUID
    employee_id: UUID           # NULL = áp dụng cho department
    department_id: UUID         # Phòng ban được cấp quyền
    scope_type: str             # "grant" (hiện tại chỉ grant)
    knowledge_type_slugs: list  # ["sop", "product"] hoặc None = tất cả
    source_ids: list            # Source IDs cụ thể hoặc None
```
