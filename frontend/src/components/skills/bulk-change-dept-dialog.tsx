"use client";

import { useState } from "react";
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

type BulkChangeDeptDialogProps = {
  skillIds: string[];
  departments: Department[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BulkChangeDeptDialog({ 
  skillIds, 
  departments,
  open, 
  onOpenChange, 
  onSuccess 
}: BulkChangeDeptDialogProps) {
  const [loading, setLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("none");

  const handleSave = async () => {
    if (skillIds.length === 0) return;

    try {
      setLoading(true);
      
      await api("/api/skills/bulk/department", {
        method: "POST",
        body: { 
          skill_ids: skillIds,
          department_id: selectedDeptId === "none" ? null : selectedDeptId
        }
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof ApiError ? (error.data as any)?.detail || error.message : "Unknown error";
      alert("Failed to change department: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">corporate_fare</span>
            Change Department for {skillIds.length} Skills
          </DialogTitle>
          <DialogDescription>
            Select a new department for all selected skills.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="department">New Department</Label>
            <Select 
              value={selectedDeptId} 
              onValueChange={(val) => setSelectedDeptId(val ?? "none")}
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Global (No Department)</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={loading} onClick={handleSave}>
            {loading ? "Updating..." : "Change Department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
