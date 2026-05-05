"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Department = {
  id: string;
  name: string;
};

export default function SkillEditPage() {
  const { slug: urlSlug } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    department_id: "",
    tags: [] as string[]
  });
  const [originalDescription, setOriginalDescription] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [skillData, deptsData, tagsData] = await Promise.all([
          api<any>(`/api/skills/${urlSlug}`),
          api<Department[]>("/api/departments"),
          api<{ items: string[], total: number }>("/api/tags")
        ]);

        setFormData({
          name: skillData.name,
          description: skillData.description || "",
          department_id: skillData.department_id || "",
          tags: skillData.tags || []
        });
        setOriginalDescription(skillData.description || "");
        setDepartments(deptsData);
        setAllTags(tagsData.items);
      } catch (error) {
        console.error("Failed to load data:", error);
        alert("Failed to load skill data");
        router.push("/skills");
      } finally {
        setLoading(false);
      }
    }
    if (urlSlug) loadData();
  }, [urlSlug, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const descriptionChanged = formData.description !== originalDescription;
    let incrementVersion = false;

    if (descriptionChanged) {
      const confirmed = window.confirm(
        "You have modified the documentation (SKILL.md). This will increment the skill version. Proceed?"
      );
      if (!confirmed) return;
      incrementVersion = true;
    }

    try {
      setSaving(true);

      // Save all metadata via PATCH
      const result = await api<any>(`/api/skills/${urlSlug}`, {
        method: "PATCH",
        body: {
          ...formData,
          department_id: formData.department_id || null,
          increment_version: incrementVersion
        }
      });

      // Redirect to the potentially new slug URL
      window.location.href = `/skills/${result.slug}`;
    } catch (error) {
      const msg = error instanceof ApiError ? (error.data as any)?.detail : "Save failed";
      alert("Error: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (t: string) => {
    if (formData.tags.includes(t)) {
      setFormData({ ...formData, tags: formData.tags.filter(item => item !== t) });
    } else {
      setFormData({ ...formData, tags: [...formData.tags, t] });
      setTagInput("");
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().toLowerCase();
      if (val && !formData.tags.includes(val)) {
        setFormData({ ...formData, tags: [...formData.tags, val] });
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput && formData.tags.length > 0) {
      setFormData({ ...formData, tags: formData.tags.slice(0, -1) });
    }
  };

  const filteredTagSuggestions = useMemo(() => {
    if (!tagInput) return [];
    return allTags.filter(t =>
      t.toLowerCase().includes(tagInput.toLowerCase()) &&
      !formData.tags.includes(t)
    ).slice(0, 5);
  }, [allTags, tagInput, formData.tags]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-[-16px]">
        <button
          onClick={() => router.push(`/skills/${urlSlug}`)}
          className="flex items-center hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-base mr-1">arrow_back</span>
          Back to Details
        </button>
      </div>

      <PageHeader
        title="Edit Skill"
        description="Update information, documentation, and metadata for this skill."
        action={
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              form="skill-edit-form"
              disabled={saving || !formData.name.trim()}
              className="w-32 sm:w-40 shadow-sahara"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(`/skills/${urlSlug}`)}
              className="text-xs sm:text-sm"
            >
              Cancel
            </Button>
          </div>
        }
      />

      <form id="skill-edit-form" onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl border border-border p-5 md:p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Skill Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Document Analyzer"
                className="h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Documentation (SKILL.md)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this skill does..."
                className="min-h-[400px] font-mono text-sm leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Metadata Selectors */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-8">
            <section className="space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              >
                <option value="">Global / No Department</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </section>

            <section className="space-y-4 relative">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tags</Label>
              <div
                className={cn(
                  "flex flex-wrap gap-2 p-3 min-h-[48px] border border-border rounded-lg bg-secondary/5 transition-all cursor-text",
                  "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 focus-within:bg-background"
                )}
                onClick={() => tagInputRef.current?.focus()}
              >
                {formData.tags.map(t => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="pl-2 pr-1.5 py-0.5 h-7 text-[12px] font-medium border-primary/30 bg-primary/5 text-primary rounded-full flex items-center gap-1 animate-in zoom-in-95 duration-200"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleTag(t); }}
                      className="w-4 h-4 rounded-full bg-primary/10 hover:bg-destructive hover:text-white transition-all flex items-center justify-center ml-0.5"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '8px' }}>close</span>
                    </button>
                  </Badge>
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-sm min-w-[100px] py-1"
                  placeholder={formData.tags.length === 0 ? "Type and press Enter to add tags..." : "Add more..."}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
              </div>

              {/* Tag Suggestions */}
              {filteredTagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-border rounded-md bg-card shadow-xl z-20 overflow-hidden">
                  {filteredTagSuggestions.map(t => (
                    <div
                      key={t}
                      onClick={() => toggleTag(t)}
                      className="px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}
