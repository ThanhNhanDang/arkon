# Knowledge Base — Kiểm soát Truy cập

## Tổng quan

Arkon kiểm soát tài liệu nào mà mỗi nhân viên được phép xem qua MCP. Hệ thống dựa trên 3 cơ chế:

1. **KnowledgeScope** — quy tắc cấp quyền theo phòng ban hoặc cá nhân
2. **Project membership** — nhân viên trong project xem được sources của project
3. **Open access** — mặc định nếu không có scope nào được định nghĩa

## KnowledgeScope — Cơ chế cốt lõi

```python
class KnowledgeScope(Base):
    id: UUID
    employee_id: Optional[UUID]      # Nếu NULL → áp dụng cho cả department
    department_id: Optional[UUID]    # Phòng ban được cấp quyền
    scope_type: str                  # "grant" (hiện tại)
    knowledge_type_slugs: list       # ["sop", "product"] — lọc theo loại
    source_ids: list                 # UUID list — grant specific sources
```

Ý nghĩa:
- `knowledge_type_slugs = None` → không lọc theo type (tất cả types)
- `source_ids = None` → không lọc theo source (tất cả sources của allowed types)
- Cả hai đều None → toàn quyền truy cập

## ResolvedIdentity — Kết quả sau scope resolution

Khi MCP tool nhận Bearer token, `MCPAuthService.verify_token()` trả về:

```python
@dataclass
class ResolvedIdentity:
    employee_id: UUID
    employee_name: str
    department_id: Optional[UUID]
    allowed_knowledge_types: Optional[list[str]]  # None = mọi type
    allowed_source_ids: Optional[list[str]]       # None = mọi source
    project_source_ids: list[str]                 # Additive từ projects
    is_admin: bool
```

## Scope Resolution Algorithm

File: `app/services/mcp_auth_service.py`, hàm `_resolve_scope()`

```
1. Nếu employee.role == "admin":
      → is_admin = True, mọi field = None (open access)
      → STOP

2. Tìm KnowledgeScope với employee_id = current employee (personal scope):
   - Nếu tìm thấy:
       allowed_knowledge_types = scope.knowledge_type_slugs
       allowed_source_ids = scope.source_ids
       → STOP (personal scope override department)
   
3. Nếu không có personal scope, tìm theo department_id:
   - Nếu tìm thấy department scope:
       allowed_knowledge_types = scope.knowledge_type_slugs
       allowed_source_ids = scope.source_ids
   - Nếu không có department scope:
       allowed_knowledge_types = None   ← OPEN ACCESS
       allowed_source_ids = None        ← OPEN ACCESS

4. Resolve project sources:
   - Query ProjectMember → lấy project IDs của employee
   - Query ProjectSource → lấy source IDs từ các projects đó
   - project_source_ids = union của tất cả source IDs này
```

**Quan trọng:** Mặc định là **open access**. Nếu admin không tạo KnowledgeScope nào, mọi nhân viên đều thấy mọi tài liệu `status=ready`.

## apply_scope_filter() — SQL-level filtering

```python
def apply_scope_filter(stmt, identity: ResolvedIdentity):
```

Áp dụng WHERE conditions vào SQLAlchemy SELECT statement:

```
Nếu identity.is_admin:
    → Không thêm filter gì (admin sees all)

Nếu allowed_source_ids is None AND allowed_knowledge_types is None:
    → Không thêm filter (open access)

Ngược lại, thêm OR conditions:
    source.id IN allowed_source_ids
    OR source.knowledge_type.slug IN allowed_knowledge_types
    OR source.id IN project_source_ids
```

## Priority của Scopes

```
Admin > Personal Scope > Department Scope > Open Access (default)
```

| Scenario | Kết quả |
|----------|---------|
| Employee là admin | Xem tất cả |
| Employee có personal KnowledgeScope | Chỉ theo personal scope |
| Employee không có personal scope, nhưng dept có | Theo department scope |
| Không có scope nào | Open access — xem tất cả |
| Là member của project | Thêm project sources (additive) |

## Project-based Access

Projects cung cấp quyền **additive** — không thay thế scope hiện có mà cộng thêm:

```
Nếu employee bị limit bởi department scope (chỉ xem "sop" type),
nhưng là member của Project A có Source X (type = "confidential"),
thì employee vẫn xem được Source X qua project membership,
dù "confidential" không trong allowed_knowledge_types của họ.
```

Đây là behavior có chủ đích: project là cơ chế chia sẻ cross-functional.

## Ví dụ thực tế

### Scenario 1: HR department chỉ xem HR documents

```
KnowledgeScope:
  department_id: HR_DEPT_ID
  scope_type: "grant"
  knowledge_type_slugs: ["hr-policy", "sop"]
  source_ids: null
```

→ Nhân viên HR thấy tất cả documents có type "hr-policy" hoặc "sop".

### Scenario 2: Developer cụ thể có access vào tài liệu kỹ thuật

```
KnowledgeScope:
  employee_id: DEV_ALICE_ID
  scope_type: "grant"
  knowledge_type_slugs: ["technical", "sop"]
  source_ids: null
```

→ Alice thấy technical + SOP docs; override department scope của cô ấy.

### Scenario 3: Project bí mật với tài liệu riêng

```
Project "Alpha Launch":
  sources: [confidential_doc_1, confidential_doc_2]
  members: [Alice, Bob, Manager_Carol]
```

→ Alice/Bob/Carol thấy 2 docs này **thêm vào** scope thông thường của họ.
→ Nhân viên khác không thấy dù không bị restrict bởi scope.

## Admin Portal — Quản lý Scope

Hiện tại admin quản lý KnowledgeScope thông qua:
- `GET /api/employees/{id}` — xem current scope của employee
- Tạo KnowledgeScope trực tiếp qua API (UI quản lý scope đang trong roadmap)

Projects được quản lý qua trang `/projects` trong portal.
