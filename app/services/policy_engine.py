"""
Policy Engine — centralized authorization decisions.

Evaluates access on 2 axes (Phase 1):
  1. Membership — does principal belong to resource's scope?
  2. Role — does their scope role permit this action?

Phase 2+ will add Classification × Clearance (axis 3).
Implements FR-30, FR-31 from AccessControl.md.
"""

import uuid
from typing import Optional
from dataclasses import dataclass

from loguru import logger
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Action,
    AuditLog,
    Employee,
    ScopeMembership,
    ScopeRole,
    ScopeType,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
)


@dataclass
class PolicyDecision:
    """Result of a policy evaluation."""
    allowed: bool
    reason: str
    scope_role: Optional[ScopeRole] = None


class PolicyEngine:
    """
    Centralized authorization engine.
    All access checks route through here for consistency and audit.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def evaluate(
        self,
        principal_id: uuid.UUID,
        action: Action,
        resource_scope_type: str,
        resource_scope_id: Optional[uuid.UUID] = None,
        *,
        resource_type: str = "",
        resource_id: str = "",
        is_admin: bool = False,
    ) -> PolicyDecision:
        """
        Evaluate whether a principal can perform an action on a resource
        within a specific scope.

        Returns PolicyDecision with allow/deny + reason.
        """
        # Axis 0: Super-admin bypass
        if is_admin:
            decision = PolicyDecision(
                allowed=True,
                reason="Super-admin bypass",
                scope_role=ScopeRole.ADMIN,
            )
            await self._audit(
                principal_id, action, resource_type, resource_id,
                resource_scope_type, resource_scope_id, decision,
            )
            return decision

        # Axis 1: Membership check
        membership = await self._find_membership(
            principal_id, resource_scope_type, resource_scope_id
        )

        if not membership:
            decision = PolicyDecision(
                allowed=False,
                reason=f"No membership in scope {resource_scope_type}:{resource_scope_id or 'global'}",
            )
            await self._audit(
                principal_id, action, resource_type, resource_id,
                resource_scope_type, resource_scope_id, decision,
            )
            return decision

        scope_role = ScopeRole(membership.role)

        # Axis 2: Role × Action check
        allowed_actions = ROLE_PERMISSIONS.get(scope_role, set())
        if action not in allowed_actions:
            decision = PolicyDecision(
                allowed=False,
                reason=f"Role '{scope_role.value}' does not permit action '{action.value}'",
                scope_role=scope_role,
            )
            await self._audit(
                principal_id, action, resource_type, resource_id,
                resource_scope_type, resource_scope_id, decision,
            )
            return decision

        # All axes pass → allow
        decision = PolicyDecision(
            allowed=True,
            reason=f"Allowed: {scope_role.value} can {action.value}",
            scope_role=scope_role,
        )
        await self._audit(
            principal_id, action, resource_type, resource_id,
            resource_scope_type, resource_scope_id, decision,
        )
        return decision

    async def check_or_raise(
        self,
        principal: Employee,
        action: Action,
        resource_scope_type: str,
        resource_scope_id: Optional[uuid.UUID] = None,
        *,
        resource_type: str = "",
        resource_id: str = "",
    ) -> PolicyDecision:
        """Evaluate + raise 403 if denied. Use in route handlers."""
        from fastapi import HTTPException

        decision = await self.evaluate(
            principal_id=principal.id,
            action=action,
            resource_scope_type=resource_scope_type,
            resource_scope_id=resource_scope_id,
            resource_type=resource_type,
            resource_id=resource_id,
            is_admin=(principal.role == "admin"),
        )

        if not decision.allowed:
            raise HTTPException(
                status_code=403,
                detail=decision.reason,
            )

        return decision

    async def get_accessible_scopes(
        self,
        principal_id: uuid.UUID,
        *,
        is_admin: bool = False,
    ) -> list[ScopeMembership]:
        """Return all scopes a principal has membership in."""
        if is_admin:
            # Admin gets implicit global admin membership
            # But still return their actual memberships for scope-specific info
            pass

        stmt = (
            select(ScopeMembership)
            .where(ScopeMembership.employee_id == principal_id)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def has_scope_access(
        self,
        principal_id: uuid.UUID,
        scope_type: str,
        scope_id: Optional[uuid.UUID],
        *,
        min_role: ScopeRole = ScopeRole.READER,
        is_admin: bool = False,
    ) -> bool:
        """Quick check: does principal have at least min_role in this scope?"""
        if is_admin:
            return True

        membership = await self._find_membership(principal_id, scope_type, scope_id)
        if not membership:
            return False

        return ROLE_HIERARCHY.get(ScopeRole(membership.role), 0) >= ROLE_HIERARCHY.get(min_role, 0)

    async def _find_membership(
        self,
        principal_id: uuid.UUID,
        scope_type: str,
        scope_id: Optional[uuid.UUID],
    ) -> Optional[ScopeMembership]:
        """
        Find the best matching membership for a principal in a scope.

        Resolution order:
        1. Exact scope match (e.g., project:abc)
        2. Global scope fallback (if resource is in a more specific scope,
           global membership still grants access)
        """
        conditions = [
            ScopeMembership.employee_id == principal_id,
        ]

        # Build scope conditions: exact match OR global fallback
        scope_conditions = []

        # Exact scope match
        if scope_type == ScopeType.GLOBAL.value or scope_id is None:
            scope_conditions.append(
                (ScopeMembership.scope_type == ScopeType.GLOBAL.value)
                & (ScopeMembership.scope_id.is_(None))
            )
        else:
            scope_conditions.append(
                (ScopeMembership.scope_type == scope_type)
                & (ScopeMembership.scope_id == scope_id)
            )
            # Global fallback — global membership grants read to everything
            scope_conditions.append(
                (ScopeMembership.scope_type == ScopeType.GLOBAL.value)
                & (ScopeMembership.scope_id.is_(None))
            )

        stmt = (
            select(ScopeMembership)
            .where(*conditions, or_(*scope_conditions))
            .order_by(
                # Prefer exact scope over global fallback
                (ScopeMembership.scope_type == ScopeType.GLOBAL.value).asc(),
            )
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _audit(
        self,
        principal_id: uuid.UUID,
        action: Action,
        resource_type: str,
        resource_id: str,
        scope_type: str,
        scope_id: Optional[uuid.UUID],
        decision: PolicyDecision,
    ) -> None:
        """Write an audit log entry (append-only)."""
        if not resource_type:
            return  # Skip audit for internal checks without resource context

        try:
            entry = AuditLog(
                principal_id=principal_id,
                principal_type="human",
                action=action.value,
                resource_type=resource_type,
                resource_id=resource_id,
                scope_type=scope_type,
                scope_id=scope_id,
                decision="allow" if decision.allowed else "deny",
                reason=decision.reason,
            )
            self.db.add(entry)
            # Don't flush here — let the enclosing transaction handle it
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
