import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useStore } from "@/shared/lib/store";
import { useAsyncError } from "@/shared/hooks/useAsyncError";
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/shared/ui/sidebar";
import {
  DropdownMenu, DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { DynamicIcon } from "@/shared/components/icon-picker";
import { useConfirm } from "@/shared/components/ConfirmProvider";
import { MembersDialog } from "@/slices/workspace-members";
import { WorkspaceList } from "./workspace-switcher/WorkspaceList";
import { EditWorkspaceDialog } from "./workspace-switcher/EditDialog";
import { CreateWorkspaceDialog } from "./workspace-switcher/CreateDialog";

export function WorkspaceSwitcher() {
  const {
    workspace, workspaces, updateWorkspace, setActiveWorkspace,
    createWorkspace, deleteWorkspace, leaveWorkspace,
  } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [draftName, setDraftName] = useState(workspace.name);
  const [draftEmoji, setDraftEmoji] = useState(workspace.emoji);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📁");

  const switchOp = useAsyncError("workspaceSwitcher.switch");
  const createOp = useAsyncError("workspaceSwitcher.create");
  const deleteOp = useAsyncError("workspaceSwitcher.delete");
  const leaveOp = useAsyncError("workspaceSwitcher.leave");
  const confirm = useConfirm();

  const isOwner = workspace.role === "owner";
  const canDelete = isOwner && !workspace.isPersonal;
  const canLeave = !isOwner;

  function openEdit() {
    setDraftName(workspace.name);
    setDraftEmoji(workspace.emoji);
    setEditOpen(true);
  }
  function openCreate() {
    setNewName("");
    setNewEmoji("📁");
    setCreateOpen(true);
  }
  function save() {
    if (draftName.trim()) updateWorkspace({ name: draftName.trim(), emoji: draftEmoji });
    setEditOpen(false);
  }
  async function submitCreate() {
    if (!newName.trim()) return;
    const ok = await createOp.execute(async () => { await createWorkspace(newName.trim(), newEmoji); });
    if (ok !== undefined) setCreateOpen(false);
  }
  async function onPick(id: string) {
    if (id === workspace.id) return;
    await switchOp.execute(async () => { await setActiveWorkspace(id); });
  }
  async function onDelete() {
    if (!canDelete) return;
    const ok = await confirm({
      title: `"${workspace.name}" 워크스페이스를 삭제할까요?`,
      description: "내부의 페이지와 데이터베이스에 더 이상 접근할 수 없으며 이 작업은 되돌릴 수 없습니다.",
      variant: "destructive",
      confirmLabel: "워크스페이스 삭제",
    });
    if (!ok) return;
    await deleteOp.execute(async () => { await deleteWorkspace(workspace.id); });
  }
  async function onLeave() {
    if (!canLeave) return;
    const ok = await confirm({
      title: `"${workspace.name}" 워크스페이스에서 나갈까요?`,
      description: "이 워크스페이스의 모든 페이지와 데이터베이스에 접근할 수 없게 됩니다.",
      confirmLabel: "워크스페이스 나가기",
    });
    if (!ok) return;
    await leaveOp.execute(async () => { await leaveWorkspace(workspace.id); });
  }

  const subtitle = workspace.isPersonal
    ? "개인 · 무료"
    : workspace.role === "owner"
      ? "소유자 · 무료"
      : workspace.role === "editor" ? "편집자" : "뷰어";

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand/15 text-base">
                  <DynamicIcon value={workspace.emoji} className="text-base" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{workspace.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 opacity-60 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <WorkspaceList
              workspaces={workspaces}
              active={workspace}
              isOwner={isOwner}
              canDelete={canDelete}
              canLeave={canLeave}
              onPick={(id) => { void onPick(id); }}
              onCreate={openCreate}
              onEdit={openEdit}
              onMembers={() => setMembersOpen(true)}
              onDelete={() => { void onDelete(); }}
              onLeave={() => { void onLeave(); }}
            />
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <EditWorkspaceDialog
        open={editOpen} onOpenChange={setEditOpen}
        name={draftName} emoji={draftEmoji}
        onNameChange={setDraftName} onEmojiChange={setDraftEmoji}
        onSave={save}
      />

      <CreateWorkspaceDialog
        open={createOpen} onOpenChange={setCreateOpen}
        name={newName} emoji={newEmoji}
        onNameChange={setNewName} onEmojiChange={setNewEmoji}
        onSubmit={() => { void submitCreate(); }}
        pending={createOp.pending}
      />

      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} workspace={workspace} />
    </>
  );
}
