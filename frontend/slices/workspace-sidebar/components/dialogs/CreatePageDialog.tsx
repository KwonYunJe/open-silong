"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/shared/lib/store";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { DynamicIcon, IconPickerPopover, DEFAULT_PAGE_ICON } from "@/shared/components/icon-picker";

const DEFAULT_ICON = DEFAULT_PAGE_ICON;

/** Seed icons for a new page. This used to draw from the picker's full
 *  ~615-emoji catalog, which meant one random default dragged that catalog
 *  into the dashboard shell chunk for every route. The picker itself already
 *  loads the catalog lazily when opened; a starting suggestion does not need
 *  it. */
const STARTER_ICONS = [
  "\u{1F4C4}", "\u{1F4DD}", "\u{1F4D2}", "\u{1F4CB}", "\u{1F5C2}\uFE0F", "\u{1F4C1}",
  "\u{1F4A1}", "\u2728", "\u{1F680}", "\u{1F3AF}", "\u{1F9ED}", "\u{1F5FA}\uFE0F",
  "\u{1F331}", "\u{1F333}", "\u{1F304}", "\u{1F30A}", "\u{1F525}", "\u2B50",
  "\u{1F9E9}", "\u{1F527}", "\u{1F4CA}", "\u{1F4C8}", "\u{1F4DA}", "\u2615",
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = root page; string = subpage of given parent */
  parentId: string | null;
  /** Submit handler — receives { parentId, title, icon }. Caller drives navigation. */
  onSubmit: (data: { parentId: string | null; title: string; icon: string }) => Promise<void> | void;
}

export function CreatePageDialog({ open, onOpenChange, parentId, onSubmit }: Props) {
  const { getPage } = useStore();
  const parent = parentId ? getPage(parentId) : null;
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setTitle("");
      setIcon(STARTER_ICONS[Math.floor(Math.random() * STARTER_ICONS.length)] ?? DEFAULT_ICON);
    }
  }, [open]);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ parentId, title: title.trim(), icon });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{parent ? `New subpage in ${parent.title || "Untitled"}` : "New page"}</DialogTitle>
          <DialogDescription>
            Pick a name and icon. You can always change them later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Icon</label>
            <IconPickerPopover value={icon} onChange={setIcon} onClear={() => setIcon(DEFAULT_ICON)}>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-12 p-0 rounded-md text-2xl font-normal"
                aria-label="Change icon"
              >
                <DynamicIcon value={icon} />
              </Button>
            </IconPickerPopover>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="new-page-title">
              Name
            </label>
            <Input
              id="new-page-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
