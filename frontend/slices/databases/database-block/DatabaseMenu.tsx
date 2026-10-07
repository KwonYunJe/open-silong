import { useDbAdapter } from "../lib/useDbAdapter";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/shared/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Eye, EyeOff, Settings2, Plus, Copy, Lock, Unlock, Network } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { DynamicIcon, IconPickerPopover, DEFAULT_DATABASE_ICON } from "@/shared/components/icon-picker";
import { useConfirm } from "@/shared/components/ConfirmProvider";
import { ViewOptions } from "../ViewOptions";
import { DataMenu } from "@/slices/database-json";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "@/shared/lib/databases/propertyTypeMeta";
import type { Database, DatabaseViewConfig, Page, Property } from "@/shared/types/domain";

export function DatabaseMenu({
  db, view, rows, writeView,
}: {
  db: Database;
  view: DatabaseViewConfig;
  rows: Page[];
  writeView: (viewId: string, patch: Partial<DatabaseViewConfig>) => void;
}) {
  const { updateDatabase, trashDatabase, duplicateDatabase } = useDbAdapter();
  const confirm = useConfirm();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto rounded p-1 text-muted-foreground [&_svg]:size-3.5"
          title="데이터베이스 메뉴"
          aria-label="데이터베이스 메뉴"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">데이터베이스</div>
        <Button
          variant="ghost"
          onClick={() => {
            const next = window.prompt("데이터베이스 이름", db.name);
            if (next != null && next.trim()) updateDatabase(db.id, { name: next.trim() });
          }}
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
        >
          <Pencil className="h-3.5 w-3.5" /> 이름 변경
        </Button>
        <IconPickerPopover
          value={db.icon}
          onChange={(next) => updateDatabase(db.id, { icon: next })}
          onClear={() => updateDatabase(db.id, { icon: DEFAULT_DATABASE_ICON })}
        >
          <Button
            variant="ghost"
            type="button"
            className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
          >
            <DynamicIcon value={db.icon} className="text-base h-3.5 w-3.5" fallback={DEFAULT_DATABASE_ICON} />
            아이콘 변경
          </Button>
        </IconPickerPopover>
        <Button
          variant="ghost"
          onClick={() => duplicateDatabase(db.id)}
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
          title="속성과 보기 구조만 복제합니다. 행은 복사하지 않습니다."
        >
          <Copy className="h-3.5 w-3.5" /> 구조만 복제
        </Button>
        <Button
          variant="ghost"
          onClick={() => duplicateDatabase(db.id, { includeRows: true })}
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
          title="구조와 행을 함께 복제합니다. 최대 5000행까지 복사됩니다."
        >
          <Copy className="h-3.5 w-3.5" /> 행과 함께 복제
        </Button>
        <Button
          variant="ghost"
          onClick={() => updateDatabase(db.id, { locked: !db.locked })}
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
          title={db.locked ? "잠금을 해제하여 속성과 보기를 수정합니다" : "속성과 보기 수정을 방지하도록 잠급니다"}
        >
          {db.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {db.locked ? "데이터베이스 잠금 해제" : "데이터베이스 잠금"}
        </Button>
        <SubItemsPicker db={db} />
        <Button
          variant="ghost"
          onClick={async () => {
            const ok = await confirm({
              title: `"${db.name || "제목 없음"}" 데이터베이스를 휴지통으로 이동할까요?`,
              description: "행 데이터는 유지되며 휴지통에서 복원할 수 있습니다.",
              variant: "destructive",
              confirmLabel: "휴지통으로 이동",
            });
            if (ok) trashDatabase(db.id);
          }}
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
        >
          <Trash2 className="h-3.5 w-3.5" /> 데이터베이스 삭제
        </Button>
        <div className="my-1 border-t border-border" />
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">현재 보기</div>
        <div className="px-1 flex flex-col gap-0.5">
          <ViewOptions db={db} view={view} />
          <PropertiesMenu db={db} view={view} writeView={writeView} />
        </div>
        <div className="my-1 border-t border-border" />
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">데이터</div>
        <div className="px-1 flex flex-col gap-0.5">
          <DataMenu db={db} rows={rows} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SubItemsPicker({ db }: { db: Database }) {
  const { updateDatabase } = useDbAdapter();
  // A property is eligible as the sub-items parent if it's a self-relation
  // (or a generic relation that the user has set to point at this db).
  // The "all rows" legacy variant (no relationDatabaseId) is treated as
  // pointing to all dbs and is eligible too.
  const eligible = db.properties.filter(
    (p) => p.type === "relation" &&
      (p.relationDatabaseId === db.id || p.relationDatabaseId == null),
  );
  const current = db.subItemsParentPropId
    ? eligible.find((p) => p.id === db.subItemsParentPropId) ?? null
    : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-xs font-normal [&_svg]:size-3.5"
          title="관계 속성을 사용하여 행을 하위 항목 트리로 표시합니다"
        >
          <Network className="h-3.5 w-3.5" />
          하위 항목: <span className="text-muted-foreground truncate">{current?.name ?? "사용 안 함"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">부모 → 하위 항목 관계로 사용</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => updateDatabase(db.id, { subItemsParentPropId: null })}>
          <span className={cn(!current && "text-brand")}>사용 안 함</span>
        </DropdownMenuItem>
        {eligible.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-muted-foreground italic">
            하위 항목을 사용하려면 이 데이터베이스를 가리키는 관계 속성을 추가하세요.
          </div>
        ) : (
          eligible.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => updateDatabase(db.id, { subItemsParentPropId: p.id })}
            >
              <span className={cn(current?.id === p.id && "text-brand")}>{p.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PropertiesMenu({
  db, view, writeView,
}: {
  db: Database;
  view: DatabaseViewConfig;
  writeView: (viewId: string, patch: Partial<DatabaseViewConfig>) => void;
}) {
  const { deleteProperty, addProperty } = useDbAdapter();
  const hidden = new Set(view.hiddenPropIds ?? []);
  const viewLocked = !!view.locked;
  const toggle = (pid: string) => {
    if (viewLocked) return;
    const next = new Set(hidden);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    writeView(view.id, { hiddenPropIds: [...next] });
  };
  const showAll = () => { if (!viewLocked) writeView(view.id, { hiddenPropIds: [] }); };
  const hideAll = () => { if (!viewLocked) writeView(view.id, { hiddenPropIds: db.properties.map((p) => p.id) }); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-1 rounded-md px-2 py-1 text-xs font-normal text-muted-foreground [&_svg]:size-3">
          <Settings2 className="h-3 w-3" /> 속성
          {hidden.size > 0 && (
            <span className="ml-0.5 rounded-full bg-muted-foreground/20 text-[10px] px-1">
              {db.properties.length - hidden.size}/{db.properties.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between text-xs">
          <span>이 보기에 표시</span>
          <div className="flex gap-1 text-[10px] font-normal">
            <Button variant="link" onClick={showAll} className="h-auto p-0 text-[10px] font-normal text-muted-foreground hover:underline">모두 표시</Button>
            <span className="text-muted-foreground/40">·</span>
            <Button variant="link" onClick={hideAll} className="h-auto p-0 text-[10px] font-normal text-muted-foreground hover:underline">모두 숨기기</Button>
          </div>
        </DropdownMenuLabel>
        {db.properties.map((p: Property) => {
          const isHidden = hidden.has(p.id);
          return (
            <DropdownMenuItem
              key={p.id}
              onSelect={(e) => e.preventDefault()}
              className="flex items-center justify-between"
            >
              <Button variant="ghost" onClick={() => toggle(p.id)} className="h-auto min-w-0 flex-1 justify-start gap-2 p-0 text-left text-xs font-normal hover:bg-transparent [&_svg]:size-3.5">
                {isHidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}
                <span className={cn("truncate", isHidden && "text-muted-foreground line-through decoration-muted-foreground/40")}>{p.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{p.type}</span>
              </Button>
              <Button variant="ghost" onClick={() => deleteProperty(db.id, p.id)} className="ml-1 h-auto p-0 text-muted-foreground hover:bg-transparent hover:text-destructive [&_svg]:size-3.5" title="속성 삭제 (모든 보기)">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs"><Plus className="mr-2 h-3.5 w-3.5" /> 속성 추가</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {PROPERTY_TYPES.map((t) => (
              <DropdownMenuItem key={t} onClick={() => addProperty(db.id, t)}>
                {PROPERTY_TYPE_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
