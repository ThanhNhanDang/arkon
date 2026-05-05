"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AddTagsDialog } from "./add-tags-dialog";

type TagListResponse = {
  items: string[];
  total: number;
};

type TagsManagerProps = {
  onUpdate?: () => void;
};

export function TagsManager({ onUpdate }: TagsManagerProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const loadTags = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limit", "1000"); // Load everything

      const data = await api<TagListResponse>(`/api/tags?${params.toString()}`);
      
      setTags(data.items);
      setTotal(data.total);
      setSelectedTags([]); // Reset selection on search/reload
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTags();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadTags]);

  const toggleSelectAll = () => {
    if (selectedTags.length === tags.length && tags.length > 0) {
      setSelectedTags([]);
    } else {
      setSelectedTags([...tags]);
    }
  };

  const toggleTag = (t: string) => {
    if (selectedTags.includes(t)) {
      setSelectedTags(selectedTags.filter(item => item !== t));
    } else {
      setSelectedTags([...selectedTags, t]);
    }
  };

  const handleDelete = async () => {
    if (selectedTags.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedTags.length} tags?`)) return;

    try {
      await api("/api/tags/bulk", {
        method: "DELETE",
        body: { names: selectedTags }
      });
      loadTags();
      if (onUpdate) onUpdate();
    } catch (error) {
      const msg = error instanceof ApiError ? (error.data as any)?.detail || error.message : "Unknown error";
      alert("Failed to delete tags: " + msg);
    }
  };

  const isAllSelected = tags.length > 0 && selectedTags.length === tags.length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-card rounded-xl border border-border shadow-sahara overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border bg-secondary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">sell</span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Tag Management</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Total: {total} tags</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">search</span>
              <Input 
                placeholder="Search tags..." 
                className="pl-8 h-9 text-sm w-full sm:w-64 bg-background/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <AddTagsDialog onTagsAdded={() => {
              loadTags();
              if (onUpdate) onUpdate();
            }} />
          </div>
        </div>

        <div className="flex-1 flex flex-col p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-md border border-border shadow-sm hover:border-primary/50 transition-all cursor-pointer"
                onClick={toggleSelectAll}
              >
                <input 
                  type="checkbox" 
                  className="w-4 h-4 cursor-pointer accent-primary"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-xs font-bold text-foreground uppercase tracking-tight">
                  {isAllSelected ? "Unselect All" : "Select All"}
                </span>
              </div>
              {selectedTags.length > 0 && (
                <span className="text-sm font-semibold text-primary animate-in fade-in slide-in-from-left-1">
                  {selectedTags.length} tags selected
                </span>
              )}
            </div>

            <Button 
              variant="destructive" 
              size="sm" 
              disabled={selectedTags.length === 0}
              onClick={handleDelete}
              className="h-9 px-4 font-semibold shadow-sahara"
            >
              <span className="material-symbols-outlined text-sm mr-1">delete</span>
              Delete ({selectedTags.length})
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {loading ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary/40">progress_activity</span>
                <p className="text-xs text-muted-foreground italic">Loading tags...</p>
              </div>
            ) : tags.length === 0 ? (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-xl">
                <span className="material-symbols-outlined text-4xl text-muted-foreground/30 mb-2">sell</span>
                <p className="text-sm text-muted-foreground italic font-medium">No tags found.</p>
              </div>
            ) : (
              <>
                {tags.map(t => (
                  <div 
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer group",
                      selectedTags.includes(t) 
                        ? "bg-primary/5 border-primary/40 shadow-sm scale-[1.02]" 
                        : "bg-background border-border hover:border-primary/30 hover:bg-secondary/5"
                    )}
                  >
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 cursor-pointer accent-primary"
                      checked={selectedTags.includes(t)}
                      readOnly
                    />
                    <span className={cn(
                      "text-sm font-medium truncate flex-1",
                      selectedTags.includes(t) ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}>{t}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-border bg-secondary/5">
          <p className="text-xs text-muted-foreground italic flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">info</span>
            Deleting a tag will remove it from all skills. This action cannot be undone.
          </p>
        </div>
      </div>
    </div>
  );
}
