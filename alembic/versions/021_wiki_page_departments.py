"""Wiki pages M:N with departments — tag-based visibility.

Replaces single scope_type='department' / scope_id model with a junction table
(wiki_page_departments), letting one wiki page belong to multiple departments.

After this migration:
- scope_type ∈ {global, project} only on wiki_pages.
- Pages tagged via wiki_page_departments rows; no rows = global visibility.

Skills are unchanged — they keep their own scope_type='department' model.

Revision ID: 021
Revises: 020
Create Date: 2026-05-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the junction table.
    op.create_table(
        "wiki_page_departments",
        sa.Column(
            "page_id",
            UUID(as_uuid=True),
            sa.ForeignKey("wiki_pages.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index(
        "ix_wiki_page_departments_dept",
        "wiki_page_departments",
        ["department_id", "page_id"],
    )

    # 2. Guard: detect global+department slug collisions before flipping
    # scope_type. A page with scope_type='department' is about to become
    # scope_type='global'; if a global page with the same slug already
    # exists, the unique index uq_wiki_pages_slug_scope will reject the
    # UPDATE. Catch this up front with a clear error.
    conn = op.get_bind()
    # 2a. dept slug collides with an existing global page (same slug already
    #     used at global scope).
    dg_collisions = conn.execute(
        sa.text(
            """
            SELECT DISTINCT d.slug
            FROM wiki_pages d
            JOIN wiki_pages g
              ON g.slug = d.slug
             AND g.scope_type = 'global'
             AND g.scope_id IS NULL
            WHERE d.scope_type = 'department'
            """
        )
    ).fetchall()
    # 2b. two dept-scoped pages share a slug across different departments —
    #     after flattening to global, they would collide on the unique index.
    dd_collisions = conn.execute(
        sa.text(
            """
            SELECT slug
            FROM wiki_pages
            WHERE scope_type = 'department'
            GROUP BY slug
            HAVING count(*) > 1
            """
        )
    ).fetchall()
    bad = [r[0] for r in dg_collisions] + [r[0] for r in dd_collisions]
    if bad:
        raise RuntimeError(
            "Migration 021 aborted: slug collision detected. After this "
            "migration, department-scoped pages become global, so duplicate "
            "slugs (across departments, or between department and global) "
            "would violate uq_wiki_pages_slug_scope. Rename or merge "
            f"affected pages first. Offending slugs: {', '.join(bad)}"
        )

    # 3. Backfill: copy each department-scoped page's (id, scope_id) into the
    # junction table.
    op.execute(
        """
        INSERT INTO wiki_page_departments (page_id, department_id)
        SELECT id, scope_id
        FROM wiki_pages
        WHERE scope_type = 'department' AND scope_id IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )

    # 4. Convert tier: department pages become global. The dept tag carries
    # the visibility info now.
    op.execute(
        """
        UPDATE wiki_pages
        SET scope_type = 'global', scope_id = NULL
        WHERE scope_type = 'department'
        """
    )


def downgrade() -> None:
    # Best-effort revert: pages with exactly one dept tag become scope_type=
    # 'department' again. Pages with multiple dept tags lose all but one
    # tag (data loss — log via NOTICE).
    op.execute(
        """
        DO $$
        DECLARE
            multi_count int;
        BEGIN
            SELECT count(*) INTO multi_count FROM (
                SELECT page_id FROM wiki_page_departments
                GROUP BY page_id HAVING count(*) > 1
            ) m;
            IF multi_count > 0 THEN
                RAISE NOTICE 'Downgrade: % page(s) had multiple dept tags; only one will be preserved as scope_id', multi_count;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        UPDATE wiki_pages w
        SET scope_type = 'department',
            scope_id   = sub.department_id
        FROM (
            SELECT DISTINCT ON (page_id) page_id, department_id
            FROM wiki_page_departments
            ORDER BY page_id, department_id
        ) sub
        WHERE w.id = sub.page_id
          AND w.scope_type = 'global'
        """
    )

    op.drop_index("ix_wiki_page_departments_dept", table_name="wiki_page_departments")
    op.drop_table("wiki_page_departments")
