"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "org-knowledge",
    label: "Org Knowledge",
    icon: "corporate_fare",
    items: [
      { label: "Documents", href: "/knowledge", icon: "description" },
      { label: "Wiki", href: "/wiki", icon: "auto_stories" },
    ],
  },
  {
    id: "workspaces",
    label: "Workspaces",
    icon: "workspaces",
    items: [
      { label: "Workspaces", href: "/workspaces", icon: "folder_special" },
      { label: "Contacts", href: "/contacts", icon: "contacts" },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    icon: "account_tree",
    adminOnly: true,
    items: [
      { label: "Departments", href: "/departments", icon: "domain" },
      { label: "Employees", href: "/employees", icon: "group" },
      { label: "Roles", href: "/roles", icon: "manage_accounts" },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "tune",
    adminOnly: true,
    items: [
      { label: "Audit Log", href: "/audit", icon: "policy" },
      { label: "Settings", href: "/settings", icon: "settings" },
    ],
  },
];

function useCollapsed(groupId: string, defaultOpen: boolean) {
  const key = `sidebar-group-${groupId}`;
  const [open, setOpen] = React.useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(key);
    return stored === null ? defaultOpen : stored === "true";
  });

  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      localStorage.setItem(key, String(next));
      return next;
    });

  return [open, toggle] as const;
}

function NavGroupSection({
  group,
  isAdmin,
  pathname,
}: {
  group: NavGroup;
  isAdmin: boolean;
  pathname: string;
}) {
  const visibleItems = group.items.filter((i) => !i.adminOnly || isAdmin);
  if (visibleItems.length === 0) return null;

  const hasActive = visibleItems.some((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)
  );

  const [open, toggle] = useCollapsed(group.id, true);
  // Force open if a child is active
  const isOpen = open || hasActive;

  return (
    <div>
      {/* Group header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 transition-all duration-150"
      >
        <span className="material-symbols-outlined text-base">{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        <span
          className="material-symbols-outlined text-sm transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          expand_more
        </span>
      </button>

      {/* Items */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: isOpen ? `${visibleItems.length * 44}px` : "0px" }}
      >
        <div className="ml-3 mt-0.5 mb-1 space-y-0.5">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold translate-x-0.5"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <span
                  className={cn("material-symbols-outlined text-lg", isActive && "filled")}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const visibleGroups = navGroups.filter((g) => !g.adminOnly || isAdmin);

  return (
    <nav className="hidden md:flex fixed left-0 top-0 h-full w-60 border-r border-border bg-sidebar flex-col gap-1 p-4 z-40">
      {/* Brand */}
      <div className="mb-5 px-3">
        <Link href="/">
          <h1 className="text-xl font-heading text-primary tracking-tight">
            Arkon
          </h1>
        </Link>
      </div>

      {/* Dashboard — standalone */}
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 mb-2",
          pathname === "/"
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold translate-x-0.5"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        )}
      >
        <span className={cn("material-symbols-outlined text-lg", pathname === "/" && "filled")}>
          dashboard
        </span>
        Dashboard
      </Link>

      {/* Grouped sections */}
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {visibleGroups.map((group) => (
          <NavGroupSection
            key={group.id}
            group={group}
            isAdmin={isAdmin}
            pathname={pathname}
          />
        ))}
      </div>

      {/* User info */}
      {user && (
        <div className="mt-2 pt-4 border-t border-border">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {user.name}
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                {user.role}
              </span>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
}
