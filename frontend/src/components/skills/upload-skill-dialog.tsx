"use client";

import { useState, useRef, useMemo } from "react";
import { apiUpload, ApiError } from "@/lib/api";
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
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [force, setForce] = useState(false);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setSelectedFiles(null);
    setSelectedTags([]);
    setSelectedDepartmentId("");
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
      if (selectedDepartmentId) {
        formData.append("department_id", selectedDepartmentId);
      }
      formData.append("force", String(force));

      await apiUpload<{ results: any[] }>("/api/skills/upload", formData);

      setIsOpen(false);
      resetForm();
      onUploaded();
      onRefreshTags();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const data = error.data as any;
        setConflictFiles(data.detail.duplicates || []);
      } else {
        alert(error instanceof Error ? error.message : "Upload failed");
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const toggleTag = (t: string) => {
    if (selectedTags.includes(t)) {
      setSelectedTags(selectedTags.filter(item => item !== t));
    } else {
      setSelectedTags([...selectedTags, t]);
      setTagInput(""); // Clear input on select
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().toLowerCase();
      if (val && allTags.includes(val) && !selectedTags.includes(val)) {
        setSelectedTags([...selectedTags, val]);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput && selectedTags.length > 0) {
      setSelectedTags(selectedTags.slice(0, -1));
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!tagInput) return [];
    return allTags.filter(t =>
      t.toLowerCase().includes(tagInput.toLowerCase()) &&
      !selectedTags.includes(t)
    ).slice(0, 5);
  }, [allTags, tagInput, selectedTags]);

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
            <DialogTitle>Upload Skill Packages</DialogTitle>
            <DialogDescription>
              Select ZIP files and assign existing tags.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="files">Skill Files (ZIP)</Label>
              <Input
                id="files"
                type="file"
                accept=".zip"
                multiple
                onChange={(e) => setSelectedFiles(e.target.files)}
                className="bg-secondary/5"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dept">Department (Optional)</Label>
              <select
                id="dept"
                value={selectedDepartmentId}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-secondary/5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
              >
                <option value="">No Department</option>
                {allDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

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
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px] py-0.5"
                  placeholder={selectedTags.length === 0 ? "Search tags..." : ""}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* Suggestions Dropdown */}
              {filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-border rounded-md bg-card shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
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
