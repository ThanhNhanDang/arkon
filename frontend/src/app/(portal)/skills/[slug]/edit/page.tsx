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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    scope_type: "global",
    scope_id: "",
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
          scope_type: skillData.scope_type || "global",
          scope_id: skillData.scope_id || "",
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
      
      const payload: any = {
        name: formData.name,
        description: formData.description,
        tags: formData.tags,
        scope_type: formData.scope_type,
        scope_id: formData.scope_type === "global" ? null : formData.scope_id,
        increment_version: incrementVersion
      };

      // Backward compatibility for old department_id field
      if (formData.scope_type === "department") {
        payload.department_id = formData.scope_id;
      } else if (formData.scope_type === "global") {
        payload.department_id = null;
      }

      await api(`/api/skills/${urlSlug}`, {
        method: "PATCH",
        body: payload
      });

      router.push(`/skills/${urlSlug}`);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save skill changes");
    } finally {
      setSaving(false);
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!tagInput) return [];
    return allTags.filter(t => 
      t.toLowerCase().includes(tagInput.toLowerCase()) && 
      !formData.tags.includes(t)
    ).slice(0, 5);
  }, [tagInput, allTags, formData.tags]);

  const toggleTag = (tag: string) => {
    if (formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    } else {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
    }
    setTagInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput) {
      e.preventDefault();
      toggleTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && formData.tags.length > 0) {
      setFormData({ ...formData, tags: formData.tags.slice(0, -1) });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-2">
        <button 
          onClick={() => router.push(`/skills/${urlSlug}`)}
          className="flex items-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
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

        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-8">
            <section className="space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Visibility</Label>
              <Select 
                value={formData.scope_type} 
                onValueChange={(v) => setFormData({ ...formData, scope_type: v, scope_id: "" })}
              >
                <SelectTrigger className="bg-secondary/5 h-11">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-primary">
                      {formData.scope_type === "global" ? "public" : "domain"}
                    </span>
                    <span className="capitalize">{formData.scope_type}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="min-w-[240px]">
                  <SelectItem value="global">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">public</span>
                      Global (All employees)
                    </div>
                  </SelectItem>
                  <SelectItem value="department">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">domain</span>
                      Department
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </section>

            {formData.scope_type === "department" && (
              <section className="space-y-4 animate-in fade-in slide-in-from-top-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Target Department</Label>
                <Select 
                  value={formData.scope_id} 
                  onValueChange={(v) => setFormData({ ...formData, scope_id: v })}
                >
                  <SelectTrigger className="bg-secondary/5 h-11 border-primary/20">
                    <SelectValue>
                      {departments.find(d => d.id === formData.scope_id)?.name || "Select department..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
            )}

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
                    className="pl-2 pr-1.5 py-0.5 h-7 text-[12px] font-medium border-primary/30 bg-primary/5 text-primary rounded-full flex items-center gap-1"
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
                  className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px] py-0.5"
                  placeholder={formData.tags.length === 0 ? "Add tags..." : ""}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-border rounded-md bg-card shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-1">
                  {filteredSuggestions.map(t => (
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
