# Knowledge Base — MCP Tools cho Claude Desktop

## Tổng quan

Arkon expose 6 MCP tools để Claude Desktop truy cập knowledge base. Mỗi tool yêu cầu Bearer token hợp lệ và tự động áp dụng scope filtering theo quyền của nhân viên.

## Cấu hình Claude Desktop

Thêm vào `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arkon": {
      "url": "http://your-arkon-host/mcp",
      "headers": {
        "Authorization": "Bearer ark_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Token được tạo và quản lý bởi admin trong portal tại `Employees → [employee] → Generate MCP Token`.

## Authentication Flow

Mỗi lần Claude gọi một MCP tool:

```
1. Tool nhận HTTP request từ Claude Desktop
2. _get_identity() đọc header: Authorization: Bearer <token>
3. MCPAuthService.verify_token(token) → kiểm tra DB
4. Nếu hợp lệ → trả về ResolvedIdentity
5. _get_allowed_source_ids(identity) → tính set of allowed source IDs
6. Tool thực thi + áp dụng scope filter
7. Kết quả trả về Claude
```

Nếu token không hợp lệ hoặc thiếu, tool trả về error message thay vì data.

---

## Tool 1: search_knowledge

Tìm kiếm semantic trong knowledge base.

```
search_knowledge(
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.3,
    knowledge_type: Optional[str] = None
) → str
```

**Parameters:**

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `query` | — | Câu hỏi hoặc từ khóa tìm kiếm (ngôn ngữ tự nhiên) |
| `top_k` | 5 | Số kết quả tối đa trả về |
| `min_similarity` | 0.3 | Ngưỡng similarity tối thiểu (0–1) |
| `knowledge_type` | None | Filter theo type slug: "sop", "product", "hr-policy"... |

**Khi nào dùng:** Khi nhân viên hỏi câu hỏi có thể trả lời từ tài liệu nội bộ.

**Ví dụ output:**
```
Found 3 relevant result(s) for: "quy trình nghỉ phép"

---

### Result 1 — **HR Policy 2024** (page 12) [78% match]

Nhân viên có thể đăng ký nghỉ phép có lương (Annual Leave) tối thiểu 3 ngày
trước ngày nghỉ thông qua hệ thống HRM. Số ngày phép còn lại được tính dựa
trên năm làm việc...

[Download source](https://minio.../hr-policy-2024.pdf?token=...)

---

### Result 2 — **Employee Handbook** (page 5) [62% match]
...
```

**Scope:** Chỉ trả kết quả từ sources mà employee được phép truy cập.

---

## Tool 2: get_document

Lấy nội dung đầy đủ của một tài liệu theo ID.

```
get_document(
    source_id: str,
    max_length: int = 10000
) → str
```

**Parameters:**

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `source_id` | — | UUID của Source (lấy từ search results) |
| `max_length` | 10000 | Số ký tự tối đa trả về |

**Khi nào dùng:** Sau khi `search_knowledge` tìm thấy tài liệu liên quan, dùng tool này để đọc nội dung chi tiết hơn.

**Ví dụ output:**
```
# HR Policy 2024

**Type:** file
**Knowledge Type:** HR Policy
**File:** hr-policy-2024.pdf
**Status:** ready
**Added:** 2024-01-15 09:30

## Summary
Tài liệu này mô tả các chính sách nhân sự của công ty năm 2024, bao gồm
chính sách nghỉ phép, thưởng, phúc lợi và quy trình kỷ luật...

## Full Content
CHÍNH SÁCH NHÂN SỰ 2024

I. Chính sách nghỉ phép
1.1 Nghỉ phép có lương (Annual Leave)
...

... (truncated, 15420 more characters)
```

**Scope:** Trả 403-style message nếu document ngoài scope của employee.

---

## Tool 3: list_sources

Liệt kê tài liệu có sẵn trong knowledge base.

```
list_sources(
    status: str = "ready",
    knowledge_type: Optional[str] = None,
    limit: int = 20
) → str
```

**Parameters:**

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `status` | "ready" | Filter: "ready", "processing", "error", "all" |
| `knowledge_type` | None | Filter theo type slug |
| `limit` | 20 | Số tài liệu tối đa |

**Khi nào dùng:** Khi nhân viên muốn biết có những loại tài liệu gì trong KB.

**Ví dụ output:**
```
**Knowledge Base — 12 document(s)**

### HR Policy (3)
- **HR Policy 2024** (ID: `a1b2c3d4-...`)
- **Onboarding Guide** (ID: `e5f6g7h8-...`)
- **Leave Policy Update** (ID: `i9j0k1l2-...`)

### Standard Operating Procedure (5)
- **Customer Support SOP v2** (ID: `m3n4o5p6-...`)
...
```

**Scope:** Chỉ liệt kê sources employee có quyền truy cập (apply_scope_filter ở SQL level).

---

## Tool 4: list_categories

Liệt kê cây danh mục trong knowledge graph.

```
list_categories() → str
```

Không có parameters. Trả về category tree từ Neo4j.

**Khi nào dùng:** Khi nhân viên muốn khám phá KB theo cấu trúc chủ đề.

**Ví dụ output:**
```
**Knowledge Categories**

- **Human Resources** (15 docs) — Policies and procedures for HR
  - **Leave & Attendance** (5 docs)
  - **Compensation** (4 docs)
- **Product** (8 docs)
  - **Product A** (3 docs)
```

**Ghi chú:** Tool này chỉ hoạt động nếu Neo4j được cấu hình. Nếu không → trả về thông báo "Knowledge graph is not available."

---

## Tool 5: find_contacts

Tìm nhân sự nội bộ có thể hỗ trợ về một chủ đề.

```
find_contacts(
    topic: Optional[str] = None,
    department: Optional[str] = None,
    limit: int = 5
) → str
```

**Parameters:**

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `topic` | None | Chủ đề cần hỗ trợ |
| `department` | None | Filter theo tên phòng ban |
| `limit` | 5 | Số liên hệ tối đa |

**Khi nào dùng:** Khi knowledge base không có đủ thông tin và nhân viên cần hỏi người có chuyên môn.

**Thuật toán scoring (khi có topic):**
- +1 điểm cho mỗi topic trong `Contact.topics` match với query
- +1 điểm nếu `Contact.role` chứa từ khóa trong query
- Sort DESC theo điểm

**Ví dụ output:**
```
**Relevant Contacts**

- **Nguyễn Thị Mai**
  Role: HR Manager
  Phone: +84 90 123 4567
  Email: mai.nguyen@company.com
  Topics: leave policy, onboarding, benefits

- **Trần Văn Hùng**
  Role: HR Specialist
  Email: hung.tran@company.com
  Topics: payroll, leave policy
```

---

## Tool 6: get_category_knowledge

Lấy danh sách tài liệu trong một danh mục cụ thể.

```
get_category_knowledge(
    category_name: str,
    top_k: int = 10
) → str
```

**Parameters:**

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `category_name` | — | Tên danh mục (case-insensitive match) |
| `top_k` | 10 | Số tài liệu tối đa |

**Khi nào dùng:** Sau `list_categories`, dùng tool này để xem tài liệu trong một danh mục cụ thể.

**Ví dụ output:**
```
**Documents in 'Leave & Attendance'** (3 found)

- **HR Policy 2024** (ID: `a1b2c3d4-...`)
- **Leave Request Form Guide** (ID: `e5f6g7h8-...`)
- **Overtime Policy** (ID: `i9j0k1l2-...`)

_Use `get_document(source_id)` to read full content._
```

**Scope:** Post-filter kết quả từ Neo4j theo allowed_source_ids.

---

## Typical Workflow

Một session điển hình của nhân viên với Claude:

```
Employee: "Tôi muốn nghỉ phép 3 ngày tuần sau, cần làm gì?"

Claude: [gọi search_knowledge(query="quy trình đăng ký nghỉ phép")]
→ Tìm thấy HR Policy 2024, page 12, 78% match

Claude: [gọi get_document(source_id="a1b2...")] nếu cần chi tiết hơn

Claude: "Theo HR Policy 2024 (trang 12), bạn cần đăng ký qua hệ thống HRM 
tối thiểu 3 ngày trước. Bạn có X ngày phép còn lại..."

Employee: "Ai là người duyệt đơn của tôi?"

Claude: [gọi find_contacts(topic="leave approval", department="HR")]
→ Trả về HR Manager + HR Specialist

Claude: "Đơn nghỉ phép của bạn sẽ được duyệt bởi Nguyễn Thị Mai 
(HR Manager, mai.nguyen@company.com)"
```
