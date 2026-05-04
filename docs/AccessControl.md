# SRS — Cơ chế Phân quyền Knowledge Base nội bộ

**Phiên bản:** 0.1 (draft)
**Ngày:** 2026-05-04
**Phạm vi:** Cơ chế phân quyền (access control) cho hệ thống Knowledge Base nội bộ org, có sự tham gia của con người và LLM agent.

---

## 1. Tổng quan

### 1.1 Mục đích
Tài liệu này đặc tả yêu cầu phân quyền truy cập Knowledge Base (KB) nội bộ — bao gồm wiki được con người và LLM agent cùng bảo trì, theo các scope: global, project, customer, team. Tài liệu **không** mô tả lưu trữ, retrieval, hay UI; chỉ mô tả ai được làm gì, với cái gì, trong điều kiện nào.

### 1.2 Phạm vi
- **Trong phạm vi:** mô hình quyền, principal, action, classification, delegation, audit, lifecycle account/agent, các use case truy cập điển hình.
- **Ngoài phạm vi:** giao thức kết nối (đã chốt qua MCP), thuật toán retrieval, lưu trữ vật lý, UI quản trị, tích hợp SSO cụ thể.

### 1.3 Đối tượng đọc
KB admin, security/compliance, tech lead các team xây ingest pipeline, người duyệt PR, auditor.

### 1.4 Kiến trúc "Hai Thế Giới" (Two Realms)
Hệ thống Knowledge Base được chia thành hai "realm" hoàn toàn độc lập về mặt tổ chức và phân quyền:

1. **Realm 1 — Org KB (Kiến thức tổ chức)**:
   - Bao gồm: SOP, quy trình, chính sách, kiến thức tổng thể của công ty.
   - Cấu trúc: Phản chiếu org chart (theo phòng ban/department).
   - Vòng đời: Ổn định, cập nhật chậm (ví dụ theo quý).
   - Phân quyền: Mặc định tất cả nhân sự (internal) đều có quyền đọc (`reader`). Việc chỉnh sửa được thực hiện bởi `maintainer`/`owner` do quản lý phòng ban chỉ định (hoặc qua cơ chế PR). 

2. **Realm 2 — Workspaces (Dự án & Khách hàng)**:
   - Bao gồm: Tài liệu kỹ thuật, meeting notes, scope of work của một dự án hay khách hàng cụ thể.
   - Cấu trúc: Nhóm độc lập (Project), không phụ thuộc vào sơ đồ tổ chức công ty.
   - Vòng đời: Cập nhật liên tục, có thời hạn rõ ràng (active → archived).
   - Phân quyền: Roster (danh sách thành viên) hoàn toàn ad-hoc. Một dự án có thể gồm Engineer, Sales, Legal cùng tham gia. **Sếp của một phòng ban không tự động có quyền vào workspace nếu không được invite.** 

*Luồng dữ liệu (Data flow)*: Workspaces có thể đọc/tham chiếu Org KB để lấy hướng dẫn (SOP), nhưng Org KB tuyệt đối không chứa/link ngược lại các Workspaces cụ thể để tránh rác thông tin khi dự án kết thúc. Các bài học từ Workspace muốn đưa lên Org KB phải thông qua quá trình duyệt (PR) để tổng quát hóa.

---

## 2. Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| **Scope** | Đơn vị phân vùng tri thức. Bốn loại: `global`, `project:<id>`, `customer:<id>`, `team:<id>`. |
| **Principal** | Chủ thể thực hiện hành động: Human (qua SSO) hoặc Agent (LLM với service identity). |
| **Role** | Vai trò của principal trong một scope: `reader`, `contributor`, `owner`, `admin`. |
| **Membership** | Việc một principal được khai thuộc về một scope. |
| **Classification** | Mức nhạy cảm của resource: `public`, `internal`, `confidential`, `restricted`. |
| **Clearance** | Mức nhạy cảm cao nhất một principal được đọc trong một scope. |
| **Action** | Hành vi nguyên tử trên resource (read, propose_pr, merge_pr, …). |
| **Delegation** | Việc Agent hành động "thay mặt" một human user; quyền thực thi là giao của hai bên. |
| **PR** | Pull request — cơ chế đề xuất thay đổi qua review. |
| **Break-glass** | Truy cập khẩn cấp ngoài quyền thường, có alarm và quorum. |
| **Resource** | Một page wiki, một file raw, hoặc một thư mục scope, có frontmatter mô tả scope/classification/owner. |

---

## 3. Tác nhân (Actors)

### 3.1 Con người
| Actor | Mô tả |
|---|---|
| **Member** | Nhân viên thường, thuộc một hoặc nhiều scope, role tùy scope. |
| **Scope Owner** | Người chịu trách nhiệm một project/customer/team. Duyệt PR, quản lý membership trong scope. |
| **KB Admin** | Quản trị schema, taxonomy, control plane. Toàn quyền cấu hình, không phải toàn quyền đọc. |
| **Auditor** | Chỉ đọc audit log. Không truy cập nội dung KB trực tiếp. |
| **Security Officer** | Khởi xướng break-glass, revoke, điều tra sự cố. |

### 3.2 LLM Agent
| Actor | Mô tả |
|---|---|
| **Ingest Agent** | Đọc raw mới, đề xuất sửa wiki qua PR. Một agent = một scope. |
| **Lint Agent** | Quét toàn KB tìm orphan, stale, contradiction. Tạo issue, không sửa nội dung. |
| **Synthesis Agent** | Tổng hợp cross-scope theo yêu cầu user. Luôn chạy với delegation từ user. |
| **Review Agent** | Bình luận PR (ví dụ kiểm tra trích dẫn nguồn). Không merge. |

### 3.3 Hệ thống
| Actor | Mô tả |
|---|---|
| **Gateway** | Điểm enforce duy nhất. Mọi truy cập đi qua đây. |
| **Policy Engine** | Đánh giá quyết định cho từng request. |
| **Control Plane** | Lưu mapping principal → scope/role/clearance, quản lý token. |
| **Audit Store** | Append-only, lưu mọi quyết định cấp phép. |

---

## 4. Mô hình phân quyền

### 4.1 Ba trục quyền độc lập
Mọi quyết định cấp phép là **giao** của ba trục:

1. **Membership** — principal có thuộc scope của resource không?
2. **Role** — role của principal trong scope đó có cho phép action này không?
3. **Clearance** — clearance của principal trong scope đó có ≥ classification của resource không?

Thiếu bất kỳ trục nào → từ chối.

### 4.2 Catalog action

| Action | Mô tả ngắn |
|---|---|
| `read` | Đọc nội dung page |
| `list` | Liệt kê page trong scope |
| `comment` | Bình luận trên PR/page |
| `propose_pr` | Tạo PR sửa nội dung |
| `merge_pr` | Duyệt và merge PR |
| `write_direct` | Commit trực tiếp (chỉ dùng cho hot-fix admin) |
| `delete` | Xóa page (audit nặng) |
| `create_link` | Tạo wiki-link giữa hai page |
| `schema_modify` | Sửa `_schema/` (taxonomy, role, classification) |
| `agent_invoke` | Gọi một LLM agent |
| `break_glass` | Truy cập khẩn cấp ngoài quyền |
| `audit_read` | Đọc audit log |

### 4.3 Ma trận Role × Action (mặc định)

| Action | Reader | Contributor | Owner | Admin |
|---|:-:|:-:|:-:|:-:|
| read | ✓ | ✓ | ✓ | ✓ |
| list | ✓ | ✓ | ✓ | ✓ |
| comment | – | ✓ | ✓ | ✓ |
| propose_pr | – | ✓ | ✓ | ✓ |
| merge_pr | – | – | ✓ | ✓ |
| create_link | – | ✓ | ✓ | ✓ |
| delete | – | – | ✓ | ✓ |
| write_direct | – | – | – | ✓ |
| schema_modify | – | – | – | ✓ |

`agent_invoke`, `break_glass`, `audit_read` là quyền cấp riêng, không gắn role.

### 4.4 Classification × Clearance

| Classification | Clearance tối thiểu để đọc |
|---|---|
| public | (mọi principal đã authn) |
| internal | internal |
| confidential | confidential |
| restricted | restricted |

Mặc định khi tạo page mới: lấy `classification_default` của scope (khai trong `_meta.yaml`). Page customer mặc định = `confidential`. Page global mặc định = `internal`.

### 4.5 Đặc thù Agent

- Mỗi agent có **service identity riêng**: `<type>:<scope>` (ví dụ `ingest:customer:acme`).
- Agent chỉ được cấp **đúng một scope hoạt động** (trừ lint/synthesis).
- Agent **không bao giờ** có `merge_pr` hoặc `write_direct` ở wiki.
- Agent token TTL ngắn (≤ 15 phút), refresh qua control plane.
- Mọi action của agent có audit, gắn `agent_id` + `on_behalf_of` (nếu có delegation).

### 4.6 Delegation
Khi human user gọi agent (qua MCP):
- Agent hành động với **quyền giao** giữa quyền agent và quyền user.
- Agent không thể vượt quyền user; user không thể vượt quyền agent.
- Mọi audit entry phải ghi cả hai identity.

---

## 5. Functional Requirements

### 5.1 Authentication & Identity
- **FR-01.** Mọi truy cập KB phải được authenticate trước khi đến Policy Engine.
- **FR-02.** Human user authn qua SSO (OIDC) của org.
- **FR-03.** Agent authn qua service token do Control Plane cấp, TTL ≤ 15 phút.
- **FR-04.** Token bị revoke ở Control Plane phải có hiệu lực trên Gateway trong ≤ 60 giây.
- **FR-05.** Hệ thống phải duy trì danh mục agent (registry) gồm: agent_id, type, scope, allowed_actions, owner team, ngày tạo, ngày revoke.

### 5.2 Membership & Role
- **FR-10.** Một principal có thể thuộc nhiều scope với role khác nhau ở mỗi scope.
- **FR-11.** Mọi thay đổi membership phải qua Scope Owner duyệt (trừ KB Admin trong tình huống bootstrap).
- **FR-12.** Role mặc định khi thêm member mới = `reader`; nâng quyền cần Scope Owner duyệt.
- **FR-13.** Hệ thống phải hỗ trợ role override theo scope (ví dụ Alice là `owner` ở `project:alpha` nhưng `reader` ở `customer:acme`).

### 5.3 Classification & Clearance
- **FR-20.** Mọi page wiki phải có frontmatter khai `scope` và `classification`. Page thiếu hai trường này không được serve (lint chặn ở CI).
- **FR-21.** Page tăng classification (ví dụ `internal` → `confidential`) chỉ Scope Owner hoặc Admin được làm. Hệ thống phải log riêng các thay đổi này.
- **FR-22.** Clearance của principal được cấp **theo scope**, không phải toàn cục.
- **FR-23.** Page có `restricted` classification phải có ít nhất hai approver khi tạo/sửa.

### 5.4 Quyết định cấp phép
- **FR-30.** Policy Engine phải đánh giá ba trục (membership, role, clearance) cho mọi request, theo thứ tự bất kỳ nhưng kết quả phải bằng phép giao.
- **FR-31.** Kết quả deny phải kèm **lý do có thể đọc được** để debug và audit.
- **FR-32.** Thay đổi policy phải có versioning; mỗi quyết định audit log phải ghi `policy_version` đang dùng.
- **FR-33.** Policy phải hỗ trợ **obligation**: Gateway phải thực thi sau khi allow (ví dụ redact PII field, gắn watermark, audit cấp cao).

### 5.5 Write & PR
- **FR-40.** Mọi sửa đổi vào `wiki/` phải qua PR. Commit thẳng main bị chặn ở storage layer (không chỉ ở UI).
- **FR-41.** Agent **không bao giờ** được merge PR. Yêu cầu human approver.
- **FR-42.** PR sửa cross-scope (ví dụ link từ `customer:acme` sang `customer:bigco`) bị chặn trừ khi là link tới `global`.
- **FR-43.** PR sửa nội dung phải pass lint: frontmatter hợp lệ, source citation tồn tại, không link tới scope khác.
- **FR-44.** Mọi page do agent sửa phải có trường `sources:` trỏ về raw; thiếu source → CI block PR.

### 5.6 Delegation
- **FR-50.** Khi agent được gọi qua MCP với danh tính human user, request phải mang cả hai identity tới Gateway.
- **FR-51.** Quyền thực thi là **giao** của agent và user trên cả ba trục.
- **FR-52.** Agent autonomous (không có delegation) chỉ được làm các action đã đăng ký trong agent registry với đúng scope đó.

### 5.7 Lifecycle
- **FR-60.** Khi nhân sự rời org: tất cả membership bị thu hồi trong ≤ 1 giờ kể từ HR off-board.
- **FR-61.** Khi customer rời / chấm dứt hợp đồng: scope chuyển sang `archived:customer:<id>`, classification nâng lên `restricted`. Sau N ngày (mặc định 90), chuyển sang cold storage immutable.
- **FR-62.** Page bị xóa thực ra là move sang `_archive/` với metadata người xóa và lý do; xóa vật lý chỉ qua quy trình retention.
- **FR-63.** Khi project kết thúc: scope chuyển sang `archived:project:<id>`, role contributor/reader bị degrade về reader; owner giữ.

### 5.8 Break-glass
- **FR-70.** Action `break_glass` chỉ Security Officer được khởi xướng, cần **2 approver** trong vòng 5 phút.
- **FR-71.** Token break-glass TTL ≤ 1 giờ, scope hẹp tới đúng resource cần truy cập.
- **FR-72.** Mọi break-glass phải gắn ticket ID + alarm tới `#security-alerts`.
- **FR-73.** Audit break-glass review hàng tuần, lưu báo cáo ≥ 2 năm.

### 5.9 Schema & Taxonomy
- **FR-80.** Sửa `_schema/` (role, classification, taxonomy, classification_default) chỉ KB Admin được làm, qua PR có ≥ 2 admin approve.
- **FR-81.** Thay đổi schema phải có migration plan: page hiện hữu được re-validate; page không pass được tag `needs-migration`.
- **FR-82.** Schema có versioning; mỗi page wiki có thể khai `schema_version` để tương thích ngược trong giai đoạn migration.

---

## 6. Use Cases

Các use case dùng template thống nhất: Actor / Precondition / Trigger / Main flow / Alternate / Postcondition / Liên quan FR.

---

### UC-01. Member đọc page trong scope của mình

- **Actor:** Alice (member của `project:alpha`, role `contributor`, clearance `confidential` ở scope đó).
- **Precondition:** Alice đã đăng nhập SSO. Page `projects/alpha/wiki/architecture.md` có classification `internal`.
- **Trigger:** Alice mở page qua UI (hoặc qua agent qua MCP).
- **Main flow:**
  1. Request đến Gateway kèm token của Alice.
  2. Gateway resolve attrs: Alice ∈ `project:alpha`, role `contributor`, clearance `confidential`.
  3. Gateway resolve resource: scope `project:alpha`, classification `internal`.
  4. Policy Engine kiểm tra: ✓ membership, ✓ role cho phép `read`, ✓ clearance ≥ classification.
  5. Gateway trả nội dung. Audit log: allow.
- **Postcondition:** Alice xem được page; audit ghi 1 dòng `read allow`.
- **FR liên quan:** FR-01, FR-22, FR-30.

---

### UC-02. Member cố đọc page ngoài scope (deny)

- **Actor:** Alice (chỉ ở `project:alpha`).
- **Precondition:** Alice không phải member của `customer:bigco`.
- **Trigger:** Alice gửi link `customers/bigco/wiki/profile.md`.
- **Main flow:**
  1. Gateway resolve: Alice không có grant ở `customer:bigco`.
  2. Policy Engine: thiếu membership → deny.
  3. Gateway trả 403, lý do "no scope membership".
  4. Audit log: deny + reason.
- **Alternate:** nếu Alice cố lặp lại nhiều lần → trigger rate limit + alert security.
- **Postcondition:** Alice không thấy nội dung. Sự cố được log.
- **FR liên quan:** FR-30, FR-31.

---

### UC-03. Member đọc page global

- **Actor:** Alice.
- **Precondition:** Page `global/products/widget-pro.md`, classification `internal`.
- **Trigger:** Alice mở page.
- **Main flow:**
  1. Gateway resolve: Alice có ≥ 1 scope membership; với `global` áp dụng quy tắc fall-through.
  2. Clearance Alice ở `global` = `internal` ≥ classification `internal`. ✓
  3. Allow.
- **Alternate:** nếu page `confidential` mà clearance Alice ở `global` chỉ `internal` → deny.
- **FR liên quan:** FR-22, FR-30.

---

### UC-04. Contributor đề xuất sửa page (tạo PR)

- **Actor:** Alice (contributor ở `project:alpha`).
- **Precondition:** Page tồn tại, Alice đang chỉnh trong nhánh feature.
- **Trigger:** Alice push branch và mở PR.
- **Main flow:**
  1. Gateway nhận request `propose_pr` trên `projects/alpha/wiki/architecture.md`.
  2. Policy Engine: ✓ membership, role `contributor` cho phép `propose_pr`, ✓ clearance ≥ classification.
  3. PR được tạo. CI chạy lint: frontmatter hợp lệ, source citation tồn tại, không cross-scope link.
  4. Lint pass → PR sẵn sàng review.
- **Alternate:**
  - Lint fail (thiếu `sources:`, frontmatter sai) → PR bị block tự động, comment hiện lý do.
  - Page là `confidential` mà PR description rò rỉ thông tin sang scope khác → reviewer chặn manual.
- **Postcondition:** PR ở trạng thái chờ owner duyệt.
- **FR liên quan:** FR-40, FR-43.

---

### UC-05. Owner duyệt và merge PR

- **Actor:** Bob (owner `project:alpha`).
- **Precondition:** PR ở UC-04 đã pass lint.
- **Trigger:** Bob review và bấm "Merge".
- **Main flow:**
  1. Gateway nhận request `merge_pr`.
  2. Policy Engine: Bob là `owner` ở `project:alpha` → cho phép.
  3. Merge thành công. Branch xóa.
  4. Trigger downstream: re-index retrieval, cập nhật wiki-graph.
- **Alternate:** Bob không phải owner → deny; Alice phải nhờ owner thật.
- **FR liên quan:** FR-40.

---

### UC-06. Member cố commit thẳng main (deny)

- **Actor:** Alice.
- **Precondition:** Alice push trực tiếp lên `main`.
- **Trigger:** `git push origin main`.
- **Main flow:**
  1. Storage layer (branch protection) reject push.
  2. Gateway log một sự kiện `write_direct` deny.
- **Alternate:** Admin có thể `write_direct` cho hot-fix nhưng phải kèm ticket; mọi `write_direct` audit cấp cao.
- **FR liên quan:** FR-40.

---

### UC-07. Ingest Agent xử lý nguồn mới của customer

- **Actor:** `ingest:customer:acme` (Agent), được kích hoạt bởi pipeline khi có raw mới drop vào `customers/acme/raw/`.
- **Precondition:** Agent đã đăng ký, allowed_actions = `[read, propose_pr]` ở `customer:acme`, clearance = `confidential`.
- **Trigger:** Cron / event watcher phát hiện file mới trong `customers/acme/raw/`.
- **Main flow:**
  1. Agent yêu cầu service token từ Control Plane (TTL 15 phút).
  2. Agent đọc raw mới (`read` allow).
  3. Agent đọc các page wiki trong `customer:acme` để tìm chỗ cần cập nhật.
  4. Agent tạo branch, sinh diff, mở PR (`propose_pr` allow).
  5. PR phải có `sources:` trỏ về raw vừa đọc; CI lint.
  6. Conflict được flag với label `needs-human-review`.
- **Alternate:**
  - Agent cố đọc page ở scope khác → deny.
  - Agent thử merge → deny (FR-41).
  - Token hết hạn giữa chừng → refresh.
- **Postcondition:** PR chờ owner customer duyệt. Audit log mọi action với `agent_id`.
- **FR liên quan:** FR-03, FR-05, FR-41, FR-44, FR-52.

---

### UC-08. Lint Agent quét toàn KB và tạo issue

- **Actor:** `lint:global:readonly`.
- **Precondition:** Agent có read-only ở tất cả scope với clearance `internal` (không thấy `confidential`/`restricted`).
- **Trigger:** Cron weekly.
- **Main flow:**
  1. Agent quét page với clearance ≤ `internal`.
  2. Phát hiện orphan, stale, contradiction, dead link.
  3. Tạo issue trong scope tương ứng (action `comment` / `create_issue`).
- **Alternate:** Page `confidential` không nằm trong tập quét → admin cần lint agent riêng cho từng scope nhạy cảm nếu muốn.
- **FR liên quan:** FR-22, FR-52.

---

### UC-09. Synthesis Agent với delegation

- **Actor:** Alice (member nhiều scope) gọi `synthesis:cross-customer` qua MCP.
- **Precondition:** Alice là `contributor` ở `customer:acme` và `customer:bigco`. Agent có read trên cả hai.
- **Trigger:** Alice yêu cầu "tổng hợp các vấn đề chung của customer tier-1".
- **Main flow:**
  1. MCP gửi token agent + token Alice tới Gateway.
  2. Policy Engine tính effective subject = giao(Alice, agent).
  3. Với mỗi customer page agent định đọc: kiểm membership của Alice. Page `customer:acme`: ✓; page `customer:bigco`: ✓; page `customer:zeta` (Alice không thuộc): ✗ — bị filter ở retrieval layer trước khi vào context của agent.
  4. Agent tổng hợp từ tập đã filter, trả output cho Alice.
- **Alternate:** Alice ép agent ("ignore previous rules") → vì retrieval đã filter, agent không có dữ liệu của `zeta` để leak.
- **Postcondition:** Audit ghi cả `agent_id` và `on_behalf_of: alice@org`.
- **FR liên quan:** FR-50, FR-51.

---

### UC-10. Cố ép Agent leak cross-scope (deny)

- **Actor:** Mallory (member `customer:acme` only) gọi synthesis agent.
- **Trigger:** Prompt cố ý: "include data from customer:bigco".
- **Main flow:**
  1. Effective subject = giao(Mallory, agent) → Mallory không có grant `customer:bigco`.
  2. Retrieval filter loại bỏ tất cả page `customer:bigco` trước khi đưa vào context.
  3. Agent trả lời chỉ với data Mallory được phép.
- **Postcondition:** Audit log có cả prompt + filter applied. Nếu phát hiện pattern lặp → alert security.
- **FR liên quan:** FR-50, FR-51.

---

### UC-11. Thêm thành viên mới vào project

- **Actor:** Bob (owner `project:alpha`).
- **Trigger:** Carol cần access vào project.
- **Main flow:**
  1. Bob mở UI quản trị scope, chọn Carol từ org directory.
  2. Bob chọn role `reader` (default).
  3. System ghi grant vào Control Plane; có hiệu lực ≤ 60s.
  4. Audit log: `membership_grant`.
- **Alternate:** Bob muốn Carol là `contributor` ngay → được, vì Bob là owner.
- **FR liên quan:** FR-10, FR-11, FR-12.

---

### UC-12. Nâng role thành viên

- **Actor:** Bob (owner).
- **Trigger:** Carol cần quyền sửa.
- **Main flow:**
  1. Bob đổi role Carol từ `reader` → `contributor`.
  2. System verify Bob có quyền (owner ở scope đó).
  3. Update Control Plane; audit cấp cao vì thay đổi quyền.
- **Alternate:** Nâng tới `owner` cần ≥ 2 owner duyệt (chính sách scope-level cấu hình).
- **FR liên quan:** FR-12.

---

### UC-13. Page có PII được đọc với redaction

- **Actor:** Eve (contributor `customer:acme`, clearance `confidential`, **không** có capability `pii.read`).
- **Precondition:** Page `customers/acme/wiki/contacts.md` có `pii_fields: [phone, email]`.
- **Trigger:** Eve mở page.
- **Main flow:**
  1. Policy Engine allow read (clearance ≥ classification).
  2. Obligation `redact_fields` được kèm theo.
  3. Gateway redact `phone` và `email` trước khi trả về.
- **Alternate:** Frank có capability `pii.read` → không redact.
- **Postcondition:** Eve thấy page nhưng PII bị che (`***`). Audit ghi obligation đã apply.
- **FR liên quan:** FR-33.

---

### UC-14. Sửa taxonomy / schema

- **Actor:** KB Admin Dave.
- **Trigger:** Cần thêm classification level `legal-only`.
- **Main flow:**
  1. Dave mở PR vào `_schema/classification.yaml`.
  2. CI lint: cấu trúc YAML hợp lệ, không phá tương thích.
  3. PR cần ≥ 2 admin approve.
  4. Merge → bundle policy mới được build, deploy với `policy_version` mới.
  5. Migration plan: scan các page hiện hữu xem có cần cập nhật không.
- **FR liên quan:** FR-32, FR-80, FR-81, FR-82.

---

### UC-15. Break-glass khi sự cố

- **Actor:** Security Officer Grace, đang điều tra cáo buộc rò rỉ.
- **Trigger:** Cần đọc một page `restricted` mà Grace không có clearance.
- **Main flow:**
  1. Grace khởi tạo break-glass với ticket ID + lý do.
  2. Hệ thống yêu cầu 2 approver từ pool security/legal trong 5 phút.
  3. Approver duyệt → Gateway cấp token break-glass: TTL 1h, hẹp đúng resource đó.
  4. Alarm tới `#security-alerts`. Audit cấp cao.
  5. Sau truy cập, Grace viết postmortem trong vòng 48h.
- **Alternate:** Không đủ approver trong 5 phút → request expire, audit deny.
- **FR liên quan:** FR-70, FR-71, FR-72, FR-73.

---

### UC-16. Customer rời org → archive

- **Actor:** KB Admin Dave (theo lệnh từ business / legal).
- **Trigger:** Customer Acme chấm dứt hợp đồng.
- **Main flow:**
  1. Dave chạy quy trình `cascade_archive` trên `customer:acme`.
  2. Scope đổi sang `archived:customer:acme`, classification toàn bộ nâng lên `restricted`.
  3. Membership thường ngày bị thu hồi; chỉ còn `auditor` đọc được.
  4. Sau 90 ngày: chuyển sang cold storage immutable.
  5. Sau retention period (ví dụ 7 năm): xóa vật lý theo policy.
- **Alternate:** Yêu cầu GDPR delete sớm → thực thi immediate cascade delete; raw vẫn lưu trong `audit-eyes-only`.
- **FR liên quan:** FR-61, FR-62.

---

### UC-17. Agent token bị compromise

- **Actor:** Security Officer Grace.
- **Trigger:** Phát hiện agent tạo PR bất thường lúc 3h sáng.
- **Main flow:**
  1. Grace revoke agent identity ở Control Plane.
  2. Trong ≤ 60s, mọi token còn hiệu lực bị reject ở Gateway.
  3. Grace audit toàn bộ PR agent đó tạo trong 24h.
  4. PR đáng nghi: revert; raw bị inject: cách ly.
  5. Postmortem + rotate key.
- **FR liên quan:** FR-04.

---

### UC-18. Auditor xem audit log

- **Actor:** Auditor Henry.
- **Precondition:** Henry có capability `audit_read`, không có membership scope nào.
- **Trigger:** Compliance review hàng quý.
- **Main flow:**
  1. Henry truy cập Audit Store qua giao diện riêng (không phải KB UI).
  2. Filter theo thời gian, principal, action.
  3. Henry **không** thấy nội dung page, chỉ thấy metadata + decision.
- **Postcondition:** Báo cáo compliance.
- **FR liên quan:** quyền `audit_read`.

---

## 7. Non-Functional Requirements

### 7.1 Audit & Truy vết
- **NFR-01.** Mọi quyết định cấp phép (allow & deny) phải được log với: timestamp, request_id, principal, action, resource path & scope & classification, decision, reasons, obligations, policy_version.
- **NFR-02.** Audit log là append-only; không sửa, không xóa.
- **NFR-03.** Lưu trữ audit ≥ 2 năm cho action thường, ≥ 7 năm cho `restricted`/`break_glass`.
- **NFR-04.** Audit của agent action phải tách biệt dễ filter, gắn `agent_id` và `on_behalf_of`.

### 7.2 Tính sẵn sàng
- **NFR-10.** Gateway phải có cơ chế fail-closed: khi Policy Engine không phản hồi, deny mọi request mới (không fail-open).
- **NFR-11.** Control Plane downtime không được làm gián đoạn read; cache attrs có TTL ngắn (≤ 60s).

### 7.3 Hiệu năng (chỉ đặt ngưỡng, không đặc tả thuật toán)
- **NFR-20.** Quyết định cấp phép end-to-end (gateway round-trip) p95 ≤ 100ms.
- **NFR-21.** Revoke có hiệu lực toàn hệ thống ≤ 60s.

### 7.4 Đảm bảo cross-scope
- **NFR-30.** Retrieval cho LLM agent phải áp filter scope **ở storage layer**, không dựa vào agent tự lọc.
- **NFR-31.** Phải có red-team test định kỳ: prompt injection cố leak cross-scope; tỉ lệ leak mục tiêu = 0%.

### 7.5 Khả năng kiểm tra
- **NFR-40.** Mọi rule policy phải có ≥ 3 test case (allow path, deny path, edge case).
- **NFR-41.** Hệ thống phải có công cụ mô phỏng "what-if": nhập principal X + action Y + resource Z, trả về quyết định và lý do — không cần truy cập thật.

---

## 8. Constraints & Assumptions

### 8.1 Ràng buộc
- **C-01.** Kết nối nhân sự ↔ KB là qua MCP; SRS này không đặc tả giao thức MCP.
- **C-02.** SSO của org đã có và hỗ trợ OIDC; mapping group → scope/role được cấu hình ở Control Plane.
- **C-03.** Mọi storage write phải qua Gateway; không có path "đi tắt".
- **C-04.** PR-based workflow là bắt buộc cho `wiki/`; không có direct write cho user thường.

### 8.2 Giả định
- **A-01.** Org có quy trình HR off-board phát ra event để Control Plane revoke membership.
- **A-02.** Có ít nhất 2 admin để quy tắc 2-approver hoạt động.
- **A-03.** Mỗi project và customer có ít nhất 1 owner định danh, cập nhật khi thay đổi nhân sự.
- **A-04.** Org có #security-alerts hoặc kênh tương đương để route alarm break-glass.

---

## 9. Lộ trình triển khai (gợi ý, không bắt buộc)

| Phase | Nội dung tối thiểu |
|---|---|
| 1 | Identity + membership + read policy + Gateway MVP cho 1-2 scope. |
| 2 | PR enforcement + lint CI + write policy. |
| 3 | Agent identity + delegation + retrieval filter. |
| 4 | Classification × clearance + obligations (redaction). |
| 5 | Break-glass + audit dashboard + policy versioning + lifecycle (archive). |

---

## 10. Mục cần quyết định (open issues)

- **OI-01.** Capability `pii.read` cấp ở mức nào — toàn org, theo scope, hay theo team?
- **OI-02.** Synthesis agent cross-scope cần cấu hình allowlist scope nào được tổng hợp chung, hay để intersection tự lo?
- **OI-03.** Page `restricted` có hiển thị trong list (nhưng nội dung deny) hay ẩn hoàn toàn khỏi list?
- **OI-04.** Khi nhân sự nội bộ rời, các PR và wiki họ tạo có cần re-attribute owner không?
- **OI-05.** Retention period chính xác cho audit log của từng loại classification.

---

*— Hết —*