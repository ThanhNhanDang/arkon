# Knowledge Base — Hệ thống Tìm kiếm

## Tổng quan

Arkon hỗ trợ 3 chế độ tìm kiếm được implement trong `app/database/vector_search.py`:

| Chế độ | Hàm | Kỹ thuật |
|--------|-----|---------|
| Semantic | `semantic_search()` | pgvector cosine similarity |
| Full-text | `full_text_search()` | PostgreSQL tsvector + ts_rank_cd |
| Hybrid | `hybrid_search()` | Reciprocal Rank Fusion (RRF) |

Hiện tại MCP tool `search_knowledge` và `kb_service.search_kb()` dùng **semantic search**. Hybrid search đã implement sẵn và có thể bật lên khi cần.

## Semantic Search

```python
async def semantic_search(
    session: AsyncSession,
    query: str,
    embedding_provider,
    top_k: int = 10,
    min_similarity: float = 0.3,
    source_ids: Optional[list[UUID]] = None,
) -> list[SearchResult]
```

### Cách hoạt động

1. Embed `query` thành vector 768 chiều dùng cùng embedding provider đã dùng khi ingest
2. Tính cosine distance giữa query vector và tất cả `SourceChunk.embedding`
3. Lọc theo `min_similarity` (ngưỡng mặc định 0.3 — lọc kết quả quá ít liên quan)
4. Sort DESC theo similarity, lấy `top_k` đầu
5. Join với `Source` để lấy title + metadata

### SQL tương đương

```sql
SELECT
    sc.id,
    sc.content,
    sc.page_number,
    sc.source_id,
    s.title AS source_title,
    1 - (sc.embedding <=> $query_vector) AS similarity
FROM source_chunks sc
JOIN sources s ON sc.source_id = s.id
WHERE s.status = 'ready'
  AND (1 - (sc.embedding <=> $query_vector)) >= $min_similarity
ORDER BY sc.embedding <=> $query_vector   -- cosine distance ASC
LIMIT $top_k;
```

Operator `<=>` là cosine distance của pgvector (0 = identical, 2 = opposite).

### SearchResult

```python
@dataclass
class SearchResult:
    chunk_id: UUID
    source_id: UUID
    source_title: str
    content: str
    page_number: Optional[int]
    similarity: float           # 0.0 – 1.0
    image_urls: list[str]       # Presigned MinIO URLs
    source_download_url: str    # Presigned URL tải file gốc
```

## Full-text Search

```python
async def full_text_search(
    session: AsyncSession,
    query: str,
    top_k: int = 10,
    language: str = "english",
    source_ids: Optional[list[UUID]] = None,
) -> list[SearchResult]
```

Dùng PostgreSQL built-in full-text search:
- `to_tsvector('english', content)` — parse text thành lexemes
- `plainto_tsquery('english', query)` — parse query thành tsquery
- `ts_rank_cd()` — tính relevance score có tính đến document density

Phù hợp khi query có keyword cụ thể (tên sản phẩm, mã số, từ kỹ thuật) mà semantic search có thể bỏ sót.

## Hybrid Search (RRF)

```python
async def hybrid_search(
    session: AsyncSession,
    query: str,
    embedding_provider,
    top_k: int = 10,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3,
    min_similarity: float = 0.1,
) -> list[HybridSearchResult]
```

### Reciprocal Rank Fusion

Kết hợp kết quả từ semantic + full-text bằng công thức RRF:

```
RRF_K = 60

score(doc) = semantic_weight  / (RRF_K + rank_semantic)
           + keyword_weight   / (RRF_K + rank_fulltext)
```

Ví dụ: nếu một chunk đứng #2 trong semantic (rank=2) và #5 trong full-text (rank=5), với weights 0.7/0.3:
```
score = 0.7 / (60 + 2) + 0.3 / (60 + 5)
      = 0.7/62 + 0.3/65
      = 0.01129 + 0.00462
      = 0.01591
```

Kết quả cuối được group theo `source_id` → `HybridSearchResult` chứa list `HybridChunk` ranked.

### Khi nào dùng Hybrid

| Loại query | Nên dùng |
|-----------|---------|
| "quy trình nghỉ phép" | Semantic (concept-based) |
| "mã sản phẩm ABC-123" | Full-text (exact match) |
| "cách xử lý đơn hàng ABC-123" | Hybrid (cả hai) |

## search_kb() — Hàm chính cho MCP

```python
async def search_kb(
    session: AsyncSession,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.3,
) -> list[SearchResult]
```

Đây là hàm được gọi từ MCP tool `search_knowledge`. Quy trình:

1. Lấy embedding provider từ `ProviderRegistry`
2. Gọi `semantic_search()` với `top_k` và `min_similarity`
3. Với mỗi result, generate presigned MinIO URL (15 phút TTL) cho ảnh và file gốc
4. Trả về list `SearchResult`

Scope filtering được áp dụng **sau** bởi MCP tool, không phải trong `search_kb()`.

## Scope Filtering trong MCP

Vì `search_kb()` không biết user là ai, MCP tool `search_knowledge` xử lý scope:

```python
# Fetch nhiều hơn để bù scope loss
fetch_k = top_k if allowed_ids is None else top_k * 4

results = await search_kb(session, query, top_k=fetch_k, ...)

# Post-filter
if allowed_ids is not None:
    results = [r for r in results if str(r.source_id) in allowed_ids]

results = results[:top_k]  # Trim về top_k cuối cùng
```

Lý do fetch `top_k × 4`: sau khi filter theo scope, có thể còn ít hơn `top_k` kết quả. Fetch dư 4x để đảm bảo có đủ kết quả có liên quan sau filter.

## Ngưỡng Similarity

| `min_similarity` | Ý nghĩa |
|-----------------|---------|
| 0.1 | Rất rộng — bắt hầu hết kết quả |
| 0.3 | Mặc định — cân bằng recall/precision |
| 0.5 | Chặt — chỉ kết quả rất liên quan |
| 0.7+ | Rất chặt — gần như exact semantic match |

Employee có thể điều chỉnh khi gọi MCP tool: `search_knowledge(query="...", min_similarity=0.5)`.
