"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Skill = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  department_name?: string | null;
  current_version: number;
  version_hash?: string | null;
  status: string;
  updated_at: string;
};

type SkillCardProps = {
  skill: Skill;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onEdit?: (id: string) => void;
  onClick?: (id: string) => void;
};

export function SkillCard({
  skill,
  isSelected,
  onToggleSelect,
  onDelete,
  onEdit,
  onClick
}: SkillCardProps) {
  const dateStr = (() => {
    const d = new Date(skill.updated_at);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  })();

  return (
    <div
      onClick={() => skill.status !== "deleting" && onClick?.(skill.slug)}
      className={cn(
        "bg-card rounded-xl p-5 border transition-all flex flex-col group animate-in fade-in slide-in-from-bottom-2 duration-300 relative",
        skill.status === "deleting" ? "cursor-not-allowed opacity-80" : "cursor-pointer",
        isSelected
          ? "border-primary ring-1 ring-primary/20 shadow-lg shadow-primary/5"
          : "border-border shadow-sahara hover:border-primary/30"
      )}
    >
      {/* Checkbox */}
      <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(skill.id)}
          className="w-4 h-4 cursor-pointer accent-primary"
        />
      </div>

      <div className="flex items-start justify-between mb-3 pr-6">
        <div className="flex items-center gap-3">
          <div>
            <h3
              className={cn(
                "text-sm font-semibold text-foreground transition-colors line-clamp-1 font-manrope",
                skill.status !== "deleting" && "group-hover:text-primary hover:underline decoration-primary/30"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (skill.status !== "deleting") onClick?.(skill.slug);
              }}
            >
              {skill.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-secondary/50">v{skill.current_version}</Badge>
              {skill.department_name && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[12px]">corporate_fare</span>
                  {skill.department_name}
                </div>
              )}
              <span className={cn(
                "text-[10px] uppercase font-bold",
                skill.status === "active" ? "text-green-500" :
                  skill.status === "deleting" ? "text-destructive animate-pulse" :
                    "text-yellow-500"
              )}>{skill.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 flex-1 overflow-hidden h-[24px]">
        {skill.tags && skill.tags.length > 0 ? (
          <>
            {skill.tags.slice(0, 3).map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20 text-primary/80 truncate max-w-[80px]">
                {tag}
              </Badge>
            ))}
            {skill.tags.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 border-primary/10 text-primary/60">
                +{skill.tags.length - 3}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">No tags</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border mt-auto">
        <span className="text-[10px] text-muted-foreground">
          {dateStr}
        </span>

        <div className="flex gap-0.5 flex-nowrap" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-1.5 hover:text-primary whitespace-nowrap"
            onClick={() => onClick?.(skill.slug)}
            disabled={skill.status === "deleting"}
          >
            Details
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-1.5 hover:text-primary whitespace-nowrap"
            onClick={() => onEdit?.(skill.slug)}
            disabled={skill.status === "deleting"}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 whitespace-nowrap"
            onClick={() => onDelete(skill.id, skill.name)}
            disabled={skill.status === "deleting"}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
