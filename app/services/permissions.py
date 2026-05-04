"""
Permission constants for Arkon's custom roles system.

All permission strings are defined here as the single source of truth.
Used by: require_permission() in auth_service, Role CRUD validation, and the frontend UI.
"""

ALL_PERMISSIONS: list[str] = [
    "kb.upload",
    "kb.manage",
    "contacts.manage",
    "departments.manage",
    "employees.manage",
    "projects.manage",
    "settings.manage",
    "scopes.manage",
    "audit.read",
]

PERMISSION_GROUPS: dict[str, list[str]] = {
    "Knowledge Base": ["kb.upload", "kb.manage"],
    "Contacts":       ["contacts.manage"],
    "Departments":    ["departments.manage"],
    "Employees":      ["employees.manage"],
    "Projects":       ["projects.manage"],
    "Settings":       ["settings.manage"],
    "Access Control": ["scopes.manage", "audit.read"],
}

PERMISSION_LABELS: dict[str, str] = {
    "kb.upload":          "Upload documents",
    "kb.manage":          "Edit, delete, publish documents and manage types",
    "contacts.manage":    "Add, edit, delete contacts",
    "departments.manage": "Create, edit, delete departments",
    "employees.manage":   "Create, edit, deactivate employees",
    "projects.manage":    "Create, edit, archive projects",
    "settings.manage":    "Change AI provider settings",
    "scopes.manage":      "Manage scope memberships and roles",
    "audit.read":         "View audit log",
}
