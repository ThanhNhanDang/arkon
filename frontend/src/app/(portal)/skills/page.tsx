"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skill, SkillCard } from "@/components/skills/skill-card";
import { UploadSkillDialog } from "@/components/skills/upload-skill-dialog";
import { BulkChangeTagsDialog } from "@/components/skills/bulk-change-tags-dialog";
import { BulkChangeVisibilityDialog } from "@/components/skills/bulk-change-dept-dialog";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagsManager } from "@/components/skills/tags-manager";
import { SkillSidebarFilters } from "@/components/skills/skill-sidebar-filters";
import "./skills.css";

type SkillListResponse = {
  items: Skill[];
  total: number;
};

type Department = {
  id: string;
  name: string;
};

const LIMIT = 2000;

export default function SkillsPage() {
  const router = useRouter();
  const { canAccess } = useAuth();
  const [activeTab, setActiveTab] = useState("skills");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkTagDialogOpen, setIsBulkTagDialogOpen] = useState(false);
  const [isBulkDeptDialogOpen, setIsBulkDeptDialogOpen] = useState(false);

  // Filters state
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      activeTags.forEach(t => params.append("tag", t));
      if (selectedDepartment) params.set("department_id", selectedDepartment);
      params.set("limit", String(LIMIT));

      const data = await api<SkillListResponse>(`/api/skills?${params.toString()}`);
      setSkills(data.items);
      setSelectedIds([]);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load skills:", err);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [search, activeTags, selectedDepartment]);

  const loadAllTags = useCallback(async () => {
    try {
      const data = await api<{ items: string[], total: number }>("/api/tags");
      setAllTags(data.items);
      setActiveTags(prev => prev.filter(t => data.items.includes(t)));
    } catch {
      setAllTags([]);
    }
  }, []);

  const loadAllDepartments = useCallback(async () => {
    try {
      const data = await api<Department[]>("/api/departments");
      setAllDepartments(data);
    } catch {
      setAllDepartments([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadAllTags();
    loadAllDepartments();
  }, [loadAllTags, loadAllDepartments]);

  // Load skills when filters change (debounced search)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadSkills();
    }, 300);

    return () => clearTimeout(timer);
  }, [search, activeTags, selectedDepartment, loadSkills]);

  useEffect(() => {
    const processingIds = skills
      .filter(s => s.status === "processing" || s.status === "deleting")
      .map(s => s.id);

    if (processingIds.length === 0) return;

    const interval = setInterval(() => {
      const params = new URLSearchParams();
      processingIds.forEach(id => params.append("ids", id));
      params.set("limit", "2000"); // Ensure all processing items are returned

      api<SkillListResponse>(`/api/skills?${params.toString()}`)
        .then(data => {
          setSkills(prev => {
            // IDs được trả về từ API (còn tồn tại trong DB)
            const returnedIds = new Set(data.items.map(i => i.id));

            // IDs đang poll nhưng không có trong response → đã bị xóa khỏi DB
            const deletedIds = new Set(processingIds.filter(id => !returnedIds.has(id)));

            // Bắt đầu bằng cách loại bỏ các skill đã xóa
            let updatedItems = deletedIds.size > 0
              ? prev.filter(s => !deletedIds.has(s.id))
              : [...prev];
            let hasChanges = deletedIds.size > 0;

            // Cập nhật skill có trạng thái mới (processing → active, etc.)
            data.items.forEach(newItem => {
              const idx = updatedItems.findIndex(s => s.id === newItem.id);
              if (idx !== -1 && JSON.stringify(updatedItems[idx]) !== JSON.stringify(newItem)) {
                updatedItems[idx] = newItem;
                hasChanges = true;
              }
            });

            // Đồng bộ total khi có skill bị xóa khỏi state
            if (deletedIds.size > 0) {
              setTotal(prev => Math.max(0, prev - deletedIds.size));
            }

            return hasChanges ? updatedItems : prev;
          });
        })
        .catch(err => console.error("Polling error:", err));
    }, 3000);

    return () => clearInterval(interval);
  }, [skills.map(s => s.status).join(",")]);



  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete Skill "${name}"?`)) return;
    try {
      await api(`/api/skills/${id}`, { method: "DELETE" });
      loadSkills();
    } catch (error) {
      alert("Delete failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} skills?`)) return;

    try {
      await api("/api/skills/bulk", {
        method: "DELETE",
        body: { ids: selectedIds }
      });
      setSelectedIds([]);
      loadSkills();
    } catch (error) {
      alert("Bulk delete failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.length === skills.length && skills.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(skills.map(s => s.id));
    }
  };

  const toggleFilterTag = (t: string) => {
    if (activeTags.includes(t)) {
      setActiveTags(activeTags.filter(item => item !== t));
    } else {
      setActiveTags([...activeTags, t]);
    }
  };

  const isAllSelected = skills.length > 0 && selectedIds.length === skills.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Skill Library"
        description="Manage and deploy skill packages for your AI system."
        action={
          activeTab === "skills" && canAccess("skill", "create") ? (
            <UploadSkillDialog
              allTags={allTags}
              allDepartments={allDepartments}
              onUploaded={() => loadSkills()}
              onRefreshTags={loadAllTags}
            />
          ) : null
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="skills" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">bolt</span>
            Skills
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">sell</span>
            Tags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="mt-0 outline-none animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row gap-6 mt-2">
            {/* Sidebar Filters */}
            <SkillSidebarFilters
              search={search}
              onSearchChange={setSearch}
              allTags={allTags}
              activeTags={activeTags}
              onToggleTag={toggleFilterTag}
              onClearTags={() => setActiveTags([])}
              departments={allDepartments}
              selectedDepartment={selectedDepartment}
              onSelectDepartment={setSelectedDepartment}
              totalSkills={total}
            />

            {/* Main Content Area */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 bg-background/40 custom-scrollbar"
            >
              {/* Bulk Actions Bar */}
              {skills.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-secondary/20 p-3 sm:p-2 rounded-lg border border-border shadow-sm animate-in fade-in slide-in-from-top-1 duration-300 gap-3 sm:gap-0">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-md border border-border shadow-sm hover:border-primary/50 transition-all cursor-pointer" onClick={handleSelectAll}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        className="w-4 h-4 cursor-pointer accent-primary"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs font-bold text-foreground uppercase tracking-tight">
                        {isAllSelected ? "Unselect All" : "Select All"}
                      </span>
                    </div>
                    {selectedIds.length > 0 && (
                      <span className="text-sm font-semibold text-primary animate-in fade-in slide-in-from-left-1">
                        {selectedIds.length} selected
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canAccess("skill", "edit") && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.length === 0}
                          onClick={() => setIsBulkTagDialogOpen(true)}
                          className="h-9 px-4 font-semibold shadow-sm hover:bg-secondary transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm mr-1">label</span>
                          Change Tags
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.length === 0}
                          onClick={() => setIsBulkDeptDialogOpen(true)}
                          className="h-9 px-4 font-semibold shadow-sm hover:bg-secondary transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm mr-1">corporate_fare</span>
                          Change Visibility
                        </Button>
                      </>
                    )}
                    {canAccess("skill", "delete") && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedIds.length === 0}
                        onClick={handleBulkDelete}
                        className="h-9 px-4 font-semibold shadow-sahara"
                      >
                        <span className="material-symbols-outlined text-sm mr-1">delete_sweep</span>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-8">
                {loading ? (
                  <div className="flex items-center justify-center py-24">
                    <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
                      progress_activity
                    </span>
                  </div>
                ) : skills.length === 0 ? (
                  <EmptyState
                    icon="bolt"
                    title="No skills found"
                    description={search || activeTags.length > 0 ? "Try changing filters or search keywords." : "Upload ZIP packages to get started."}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                      {skills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isSelected={selectedIds.includes(skill.id)}
                          onToggleSelect={toggleSelect}
                          onDelete={handleDelete}
                          onEdit={(slug) => router.push(`/skills/${slug}/edit`)}
                          onClick={(slug) => router.push(`/skills/${slug}`)}
                        />
                      ))}
                    </div>


                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tags" className="mt-0 outline-none">
          <TagsManager onUpdate={loadAllTags} />
        </TabsContent>
      </Tabs>

      <BulkChangeTagsDialog
        selectedSkills={skills.filter(s => selectedIds.includes(s.id))}
        allTags={allTags}
        open={isBulkTagDialogOpen}
        onOpenChange={setIsBulkTagDialogOpen}
        onSuccess={() => {
          setSelectedIds([]);
          loadSkills();
          loadAllTags();
        }}
      />

      <BulkChangeVisibilityDialog
        skillIds={selectedIds}
        departments={allDepartments}
        open={isBulkDeptDialogOpen}
        onOpenChange={setIsBulkDeptDialogOpen}
        onSuccess={() => {
          setSelectedIds([]);
          loadSkills();
        }}
      />
    </div>
  );
}
