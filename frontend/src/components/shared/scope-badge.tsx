import { Badge } from "@/components/ui/badge";

export type ScopeType = "global" | "project" | "department" | "team";

type Props = {
  scopeType?: ScopeType | string;
  scopeId?: string;
  className?: string;
};

export function ScopeBadge({ scopeType, scopeId, className }: Props) {
  if (!scopeType) {
    // Legacy documents might not have a scope type, default to global or unknown
    return (
      <Badge variant="outline" className={`text-xs border-muted text-muted-foreground overflow-visible ${className || ""}`}>
        <span className="material-symbols-outlined mr-1 shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>public</span>
        Global
      </Badge>
    );
  }

  switch (scopeType) {
    case "global":
      return (
        <Badge variant="outline" className={`text-xs border-blue-200 text-blue-700 bg-blue-50/50 overflow-visible ${className || ""}`}>
          <span className="material-symbols-outlined mr-1 shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>public</span>
          Global
        </Badge>
      );
    case "department":
      return (
        <Badge variant="outline" className={`text-xs border-purple-200 text-purple-700 bg-purple-50/50 overflow-visible ${className || ""}`}>
          <span className="material-symbols-outlined mr-1 shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>domain</span>
          Department
        </Badge>
      );
    case "project":
      return (
        <Badge variant="outline" className={`text-xs border-amber-200 text-amber-700 bg-amber-50/50 overflow-visible ${className || ""}`}>
          <span className="material-symbols-outlined mr-1 shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>folder_special</span>
          Workspace
        </Badge>
      );
    case "team":
      return (
        <Badge variant="outline" className={`text-xs border-emerald-200 text-emerald-700 bg-emerald-50/50 overflow-visible ${className || ""}`}>
          <span className="material-symbols-outlined mr-1 shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>group</span>
          Team
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={`text-xs border-muted text-muted-foreground overflow-visible ${className || ""}`}>
          {scopeType}
        </Badge>
      );
  }
}

