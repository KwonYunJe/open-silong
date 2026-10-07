import { Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/shared/lib/utils";
import { focusSiblingBySelector } from "@/shared/lib/keyboard";
import { colorClass } from "@/shared/lib/format";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { DynamicIcon } from "@/shared/components/icon-picker";
import { useConfirm } from "@/shared/components/ConfirmProvider";
import { Button } from "@/shared/ui/button";
import type { Page, Property } from "@/shared/types/domain";

export function DayCell({
  d, ymdKey, isToday, items, colorProp, onOpenRow, onDeleteRow, onAddOnDay, hasDateProp, weekMode,
}: {
  d: Date | null;
  ymdKey: string;
  isToday: boolean;
  items: Page[];
  colorProp: Property | undefined;
  onOpenRow: (id: string) => void;
  onDeleteRow: (id: string) => void;
  onAddOnDay: () => void;
  hasDateProp: boolean;
  weekMode: boolean;
}) {
  const droppableId = d ? `cal-day:${ymdKey}` : `cal-empty:${ymdKey}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled: !d || !hasDateProp });
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (!d || !hasDateProp) return;
        if (e.target !== e.currentTarget) return;
        onAddOnDay();
      }}
      className={cn(
        "bg-card p-1.5 group relative",
        weekMode ? "min-h-[200px]" : "min-h-20 sm:min-h-24",
        isToday && "bg-brand/5",
        isOver && "ring-2 ring-brand bg-brand/10",
        d && hasDateProp && "cursor-copy hover:bg-accent/30",
      )}
    >
      {d && (
        <div className="flex items-center justify-between mb-1">
          <div className={cn(
            "text-[10px] w-5 h-5 flex items-center justify-center rounded-full",
            isToday ? "bg-brand text-brand-foreground font-bold" : "text-muted-foreground"
          )}>
            {d.getDate()}
          </div>
          {hasDateProp && (
            <Button
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onAddOnDay(); }}
              title="이 날짜에 행 추가"
              className="h-auto rounded p-0.5 text-muted-foreground/30 opacity-60 transition hover:text-foreground group-hover:opacity-100 [&_svg]:size-3"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((r) => {
          const colorOpt: { color?: string; name?: string } | null = colorProp
            ? colorProp.options?.find((o: any) => o.id === r.rowProps?.[colorProp.id]) ?? null
            : null;
          const tone = colorOpt?.color
            ? colorClass(colorOpt.color)
            : "bg-brand/15 text-brand hover:bg-brand/25 border-brand/20";
          return (
            <DraggableEvent
              key={r.id}
              row={r}
              tone={tone}
              colorOptName={colorOpt?.name}
              onOpenRow={onOpenRow}
              onDeleteRow={onDeleteRow}
            />
          );
        })}
      </div>
    </div>
  );
}

function DraggableEvent({
  row, tone, colorOptName, onOpenRow, onDeleteRow,
}: {
  row: Page;
  tone: string;
  colorOptName?: string;
  onOpenRow: (id: string) => void;
  onDeleteRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  const confirm = useConfirm();
  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={cn("relative group/event", isDragging && "opacity-40")}
    >
      <Button
        variant="ghost"
        {...attributes} {...listeners}
        onClick={() => onOpenRow(row.id)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const delta = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
            focusSiblingBySelector(e.currentTarget, "[data-db-nav-item]", delta as 1 | -1);
          }
        }}
        onContextMenu={async (e) => {
          e.preventDefault();
          const ok = await confirm({
            title: `"${row.title || "제목 없음"}" 행을 삭제할까요?`,
            description: "이 행은 휴지통으로 이동됩니다.",
            variant: "destructive",
          });
          if (ok) onDeleteRow(row.id);
        }}
        data-db-nav-item
        title={colorOptName ?? "클릭하여 열기 · 드래그하여 날짜 변경 · 우클릭하여 삭제"}
        className={cn(
          "h-auto w-full cursor-grab touch-none justify-start truncate rounded border px-1 py-0.5 pr-5 text-left text-[11px] font-normal active:cursor-grabbing",
          tone,
        )}
      >
        <DynamicIcon value={row.icon} className="text-[11px] mr-1 inline-flex" />{row.title || "제목 없음"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0.5 right-0.5 h-auto rounded p-0.5 text-current opacity-0 hover:bg-background/60 group-hover/event:opacity-100 [&_svg]:size-3"
            aria-label="일정 작업"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpenRow(row.id)}>열기</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => onDeleteRow(row.id)}>
            <Trash2 className="mr-2 h-3.5 w-3.5" /> 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
