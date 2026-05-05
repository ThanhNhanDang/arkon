"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { apiUpload, api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UploadSkillDialogProps = {
  allTags: string[];
  allDepartments: { id: string; name: string }[];
  onUploaded: () => void;
  onRefreshTags: () => void;
};

export function UploadSkillDialog({ allTags, allDepartments, onUploaded, onRefreshTags }: UploadSkillDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState("global");
  const [scopeId, setScopeId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [force, setForce] = useState(false);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setSelectedFiles(null);
    setSelectedTags([]);
    setScopeType("global");
    setScopeId("");
    setTagInput("");
    setForce(false);
    setConflictFiles([]);
  };

  const handleUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedFiles || selectedFiles.length === 0) return;

    try {
      setUploadLoading(true);
      const formData = new FormData();
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append("files", selectedFiles[i]);
      }
      formData.append("categories", selectedTags.join(","));
      formData.append("scope_type", scopeType);
      
      if (scopeType === "department") {
        formData.append("scope_id", scopeId);
        formData.append("department_id", scopeId); // Legacy support
      }

      if (force) {
        formData.append("force", "true");
      }

      await apiUpload("/api/skills/upload", formData);
      onUploaded();
      onRefreshTags();
      setIsOpen(false);
      resetForm();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictFiles(err.data?.conflicts || []);
      } else {
        alert(err instanceof Error ? err.message : "Upload failed");
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!tagInput) return [];
    return allTags.filter(t => 
      t.toLowerCase().includes(tagInput.toLowerCase()) && 
      !selectedTags.includes(t)
    ).slice(0, 5);
  }, [tagInput, allTags, selectedTags]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
    setTagInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput) {
      e.preventDefault();
      toggleTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && selectedTags.length > 0) {
      setSelectedTags(selectedTags.slice(0, -1));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger
        render={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sahara">
            <span className="material-symbols-outlined text-base mr-1">upload</span>
            Upload Skill
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleUpload}>
          <DialogHeader>
            <DialogTitle>Upload AI Skill</DialogTitle>
            <DialogDescription>
              Select one or more ZIP packages containing AI skills.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="files">Skill Packages (ZIP)</Label>
              <Input
                id="files"
                type="file"
                accept=".zip"
                multiple
                onChange={(e) => setSelectedFiles(e.target.files)}
                className="cursor-pointer bg-secondary/5 border-dashed border-2 hover:border-primary/50 transition-all py-8 h-auto"
              />
              {selectedFiles && selectedFiles.length > 0 && (
                <p className="text-[11px] text-primary font-medium animate-in fade-in">
                  {selectedFiles.length} file(s) selected
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Visibility</Label>
              <Select value={scopeType} onValueChange={(v) => {
                setScopeType(v);
                setScopeId("");
              }}>
                <SelectTrigger className="bg-secondary/5 h-11">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">
                      {scopeType === "global" ? "public" : "domain"}
                    </span>
                    <span className="capitalize">{scopeType}</span>
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
            </div>

            {scopeType === "department" && (
              <div className="grid gap-2 animate-in fade-in slide-in-from-top-1">
                <Label htmlFor="dept">Target Department</Label>
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger className="bg-secondary/5 h-11">
                    <SelectValue>
                      {allDepartments.find(d => d.id === scopeId)?.name || "Select department..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2 relative">
              <Label>Tags</Label>
              <div
                className={cn(
                  "flex flex-wrap gap-1.5 p-2 min-h-[42px] border border-border rounded-md bg-secondary/5 transition-all cursor-text",
                  "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 focus-within:bg-background"
                )}
                onClick={() => inputRef.current?.focus()}
              >
                {selectedTags.map(t => (
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
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px] py-0.5"
                  placeholder={selectedTags.length === 0 ? "Add tags..." : ""}
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
            </div>

            {conflictFiles.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                  <span className="material-symbols-outlined text-lg">warning</span>
                  Duplicate names detected
                </div>
                <p className="text-xs text-muted-foreground">
                  Existing skills: {conflictFiles.join(", ")}. Overwrite them?
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="force-check"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <Label htmlFor="force-check" className="text-xs cursor-pointer">I confirm to overwrite</Label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={uploadLoading || !selectedFiles || (conflictFiles.length > 0 && !force)}>
              {uploadLoading ? "Processing..." : "Start Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
