# Knowledge Base Documentation

Tài liệu kỹ thuật về tính năng Knowledge Base của Arkon.

## Mục lục

| File | Nội dung |
|------|---------|
| [overview.md](./overview.md) | Kiến trúc tổng quan, data models, luồng dữ liệu |
| [ingestion.md](./ingestion.md) | Pipeline nạp tài liệu 8 bước chi tiết |
| [search.md](./search.md) | Semantic search, full-text, hybrid RRF |
| [access-control.md](./access-control.md) | Scope filtering, KnowledgeScope, project-based access |
| [mcp-tools.md](./mcp-tools.md) | 6 MCP tools cho Claude Desktop |
| [api-reference.md](./api-reference.md) | REST API reference cho admin portal |

## Quick Start

1. **Admin** upload tài liệu qua portal → `/knowledge`
2. **Admin** tạo Knowledge Types để phân loại → `/types`
3. **Admin** tạo employee, generate MCP token → `/employees`
4. **Admin** (tuỳ chọn) tạo KnowledgeScope để giới hạn truy cập
5. **Employee** cấu hình Claude Desktop với MCP token
6. **Employee** hỏi Claude → Claude dùng MCP tools để tìm trong KB

## Luồng tóm tắt

```
Upload → [arq worker] → Extract → Chunk → Embed → Store (pgvector)
                                                        ↓
Employee → Claude → MCP Token → Scope Check → Semantic Search → Answer
```
