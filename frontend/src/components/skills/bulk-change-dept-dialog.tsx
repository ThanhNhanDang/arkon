"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

type Department = {
  id: string;
  name: string;
};

type BulkChangeVisibilityDialogProps = {
  skillIds: string[];
  departments: Department[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BulkChangeVisibilityDialog({ 
  skillIds, 
  departments,
  open, 
  onOpenChange, 
  onSuccess 
}: BulkChangeVisibilityDialogProps) {
  const [loading, setLoading] = useState(false);
  const [scopeType, setScopeType] = useState("global");
  const [scopeId, setScopeId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
  }, [open]);

  const handleSave = async () => {
    if (skillIds.length === 0) return;

    try {
      setLoading(true);
      
      const payload: any = {
        skill_ids: skillIds,
        scope_type: scopeType,
        scope_id: scopeType === "global" ? null : scopeId
      };

      // Sync department_id for backward compatibility
      if (scopeType === "department") {
        payload.department_id = scopeId;
      } else if (scopeType === "global") {
        payload.department_id = null;
      }

      await api("/api/skills/bulk/department", {
        method: "POST",
        body: payload
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof ApiError ? (error.data as any)?.detail || error.message : "Unknown error";
      alert("Failed to change visibility: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) {
        setScopeType("global");
        setScopeId("");
      }
    }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">visibility</span>
            Change Visibility for {skillIds.length} Skills
          </DialogTitle>
          <DialogDescription>
            Select how these skills should be visible across the organization.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 grid gap-6">
          <div className="grid gap-2">
            <Label>Visibility Scope</Label>
            <Select value={scopeType} onValueChange={(v) => {
              const val = v ?? "global";
              setScopeType(val);
              if (val === "global") setScopeId("");
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
              <Label>Target Department</Label>
              <Select value={scopeId} onValueChange={(v) => setScopeId(v ?? "")}>
                <SelectTrigger className="bg-secondary/5 h-11 border-primary/20">
                  <SelectValue>
                    {departments.find(d => d.id === scopeId)?.name || "Select department..."}
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || (scopeType !== "global" && !scopeId)}
            className="min-w-[100px]"
          >
            {loading ? "Saving..." : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
