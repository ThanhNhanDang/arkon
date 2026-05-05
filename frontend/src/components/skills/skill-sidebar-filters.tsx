"use client";

import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Department = {
  id: string;
  name: string;
};

type SkillSidebarFiltersProps = {
  search: string;
  onSearchChange: (val: string) => void;
  allTags: string[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  departments: Department[];
  selectedDepartment: string | null;
  onSelectDepartment: (id: string | null) => void;
  totalSkills?: number;
};

export function SkillSidebarFilters({
  search,
  onSearchChange,
  allTags,
  activeTags,
  onToggleTag,
  onClearTags,
  departments,
  selectedDepartment,
  onSelectDepartment,
}: SkillSidebarFiltersProps) {
  const [tagSearch, setTagSearch] = useState("");

  const filteredTags = useMemo(() => {
    if (!tagSearch) return allTags;
    return allTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));
  }, [allTags, tagSearch]);

  return (
    <div className="w-full md:w-72 shrink-0 flex flex-col gap-5 animate-in fade-in slide-in-from-left-4 duration-700">
      
      {/* 1. Discovery Hub (Search + Tags) */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-sahara flex flex-col gap-6">
        {/* Global Skill Search */}
        <div className="flex flex-col gap-3">
          <h4 className="text-lg font-serif font-semibold text-foreground tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">search_insights</span>
            Search
          </h4>
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm group-focus-within:text-primary transition-colors">
              search
            </span>
            <Input 
              placeholder="Search skills..." 
              className="pl-9 h-11 text-xs bg-background/50 border-border hover:border-primary/30 focus:border-primary transition-all rounded-xl font-manrope shadow-sm"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Tags Section */}
        <div className="flex flex-col pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-muted-foreground/60 text-lg">sell</span>
              <h5 className="text-[13px] font-bold text-foreground/80 uppercase tracking-wider font-manrope">
                Tags
              </h5>
            </div>
            {activeTags.length > 0 && (
              <button 
                onClick={onClearTags}
                className="text-[10px] text-primary hover:text-primary/80 font-bold uppercase tracking-widest hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Internal Tag Search */}
          <div className="relative group/tag mb-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-muted-foreground/40 group-focus-within/tag:text-primary/60 transition-colors">
              manage_search
            </span>
            <input 
              placeholder="Find tags..." 
              className="w-full pl-9 pr-3 py-2 text-[11px] bg-secondary/20 border-transparent focus:bg-background focus:border-primary/10 transition-all rounded-lg font-manrope outline-none italic"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto custom-scrollbar -mx-1 px-1">
            {filteredTags.length === 0 ? (
              <p className="py-6 text-[11px] text-muted-foreground italic text-center">
                {tagSearch ? "No matching tags" : "No tags available"}
              </p>
            ) : (
              filteredTags.map(tag => {
                const isActive = activeTags.includes(tag);
                return (
                  <FilterItem
                    key={tag}
                    label={tag}
                    icon={isActive ? "check_circle" : "tag"}
                    active={isActive}
                    onClick={() => onToggleTag(tag)}
                    showClose={isActive}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 2. Department Filter Card */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-sahara flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-serif font-semibold text-foreground tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary/70 text-xl">corporate_fare</span>
            Department
          </h4>
        </div>

        <div className="flex flex-col gap-1 max-h-[250px] overflow-y-auto custom-scrollbar -mx-1 px-1">
          <FilterItem
            label="All Departments"
            icon="grid_view"
            active={selectedDepartment === null}
            onClick={() => onSelectDepartment(null)}
          />
          {departments.map((dept) => (
            <FilterItem
              key={dept.id}
              label={dept.name}
              icon="corporate_fare"
              active={selectedDepartment === dept.id}
              onClick={() => onSelectDepartment(selectedDepartment === dept.id ? null : dept.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Internal Helper Components ---

interface FilterItemProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  showClose?: boolean;
}

function FilterItem({ label, icon, active, onClick, showClose }: FilterItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all duration-300 group relative text-left",
        active 
          ? "bg-primary/10 text-primary font-bold shadow-[0_2px_12px_rgba(194,101,42,0.1)]" 
          : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
      )}
    >
      <span className={cn(
        "material-symbols-outlined text-base transition-all duration-300",
        active ? "scale-110" : "text-muted-foreground/30 group-hover:text-primary/40"
      )}>
        {icon}
      </span>
      <span className="truncate flex-1 font-manrope">{label}</span>
      
      {showClose && (
        <span className="material-symbols-outlined text-xs animate-in fade-in zoom-in duration-300 opacity-60 group-hover:opacity-100">
          close
        </span>
      )}
    </button>
  );
}
