# Adapter site map — Phase 0 deliverable

> **Status check, 2026-08-30.** Still a Phase 0 checklist; the lift has
> not landed. `pnpm` commands below predate the 2026-08-10 bun migration —
> use `bun run typecheck` in this repo.

Maps every direct Convex import + every `@/shared/lib/store` import
inside `frontend/slices/editor/` + `frontend/slices/databases/` to
its target `NotionAdapter` method.

This is the **refactor checklist** for Phase 2 (editor) + Phase 3
(databases). Cross off each row as you migrate it. When all rows are
crossed off, run the verification greps from the plan doc and the
typecheck — if they pass, the slice is adapter-clean.

Generated 2026-05-21 from:
- `grep -rIn "from \"@convex/_generated|useMutation|useQuery|useAction|useConvex" frontend/slices/editor`
- `grep -rIn "from \"@/shared/lib/store" frontend/slices/{editor,databases}`
- `grep -rIohE "const \{[^}]*\} = useStore\(\)" frontend/slices/{databases,editor}`

---

## Section A — Editor: Convex direct imports (10 files, 5 unique APIs)

| File | Line | What it calls | → Adapter method | Optional? |
|---|--:|---|---|---|
| `editor/BlockEditor.tsx` | 48 | `useMutation(api.pages.insertBlocksAfter)` | `adapter.pages.insertBlocksAfter` | required |
| `editor/hooks/useFullPage.ts` | 12 | `useQuery(api.pages.getById, …)` | `adapter.pages.useOne` | required |
| `editor/blocks/image/useUpload.ts` | 11-13 | `api["features/files/mutations"].generateUploadUrl`, `.confirmUpload`, `useConvex()` | `adapter.files.upload` (already FilesAdapter — just rewire) | required |
| `editor/blocks/media/useUpload.ts` | 23-25 | (same as image) | `adapter.files.upload` | required |
| `editor/components/SelectionToolbar.tsx` | 28 | `useAction(api.ai.chat.complete)` | `adapter.ai?.complete` | **optional** — hide if missing |
| `editor/blocks/AskAIPopover.tsx` | 81 | `useAction(api.ai.chat.complete)` | `adapter.ai?.complete` | **optional** |
| `editor/hooks/useInlineAiShortcut.ts` | 31 | `useAction(api.ai.chat.complete)` | `adapter.ai?.complete` | **optional** |
| `editor/page-editor/SeenByBadge.tsx` | 27 | `useQuery(api.pageViews.recentViewers, …)` | `adapter.presence?.useRecentViewers` | **optional** — hide badge if missing |
| `editor/hooks/useReadReceipt.ts` | 11 | `useMutation(api.pageViews.touch)` | `adapter.presence?.touch` | **optional** |
| `editor/block-editor/pasteHandler.ts` | 5 | `import type { Id }` (no runtime call) | Change to `string` (boundary-cast pattern) | n/a |

**Fix complexity**: 10 files. Refactor unit ≈ 1 file per 30-60 min including smoke test. Estimated 4-5h.

**Render-prop slot to introduce in this phase**: `<PageEditor components={{ DatabaseBlock?: ComponentType }}>` — default resolves to bundled `@/slices/databases`. Wired in Phase 4 mega-slice consolidation, but the prop must EXIST on PageEditor by end of Phase 2.

---

## Section B — Editor: Store imports (22 files)

Editor's store usage is mostly READS (`pages`, `databases` lists) and
WRITES via the per-domain mutators (`addBlock`, `updateBlock`,
`deleteBlock`, `duplicateBlock`, `reorderBlocks` etc.) — all of
which map cleanly to `adapter.pages.*` methods.

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `editor/PageEditor.tsx` | `useStore()` (varies) | derive specific fields → adapter calls |
| `editor/BlockEditor.tsx` | `useStore()` (block CRUD) | `adapter.pages.addBlock/updateBlock/deleteBlock/duplicateBlock/reorderBlocks` |
| `editor/RowPropertiesPanel.tsx` | `useStore()` (row prop sheet) | `adapter.databases.setRowValue`, `adapter.pages.useOne` |
| `editor/blocks/TocBlock.tsx` | `usePages()` | `adapter.pages.useList` |
| `editor/blocks/DatabasePicker.tsx` | `useStore()` (databases list) | `adapter.databases.useList` |
| `editor/blocks/SyncedBlock.tsx` | `useStore()`, `useWorkspaces()` | `adapter.pages.useOne`, `adapter.workspaces?.useList` (optional) |
| `editor/blocks/ToggleBlock.tsx` | `useStore()` | `adapter.pages.updateBlock` |
| `editor/blocks/AskAIPopover.tsx` | `useStore()` (page context) | `adapter.pages.useOne` |
| `editor/blocks/NestedBlockControls.tsx` | `useStore()` (block actions) | `adapter.pages.updateBlock/duplicateBlock/deleteBlock` |
| `editor/blocks/BlockControls.tsx` | `useStore()` (block actions) | (same as NestedBlockControls) |
| `editor/blocks/nested-block/NestedContent.tsx` | `useStore()` | derive → adapter calls |
| `editor/block-editor/PageRefBlock.tsx` | `useStore()` (page lookup) | `adapter.pages.useOne` |
| `editor/page-editor/PageTitle.tsx` | `useStore()` (page update) | `adapter.pages.update` |
| `editor/page-editor/Subpages.tsx` | `useStore()` (children) | `adapter.pages.useChildren` |
| `editor/page-editor/HeaderActions.tsx` | `useStore()` (page actions) | `adapter.pages.toggleFavorite/trash/duplicate/move` |
| `editor/page-editor/HeaderBreadcrumbs.tsx` | `useStore()` (ancestor lookup) | `adapter.pages.useOne` (walk parents) |
| `editor/row-properties/PropertyNameCell.tsx` | `useStore()` | `adapter.databases.updateProperty` |
| `editor/page-actions/usePageActions.ts` | `useStore()` (page-level actions hub) | `adapter.pages.*` (multiple) |
| `editor/page-actions/MoveToSubmenu.tsx` | `useStore()` (move target picker) | `adapter.pages.useList`, `adapter.pages.move` |
| `editor/components/MentionTypeahead.tsx` | `useStore()` (page + db search) | `adapter.search?.pages/databases` (optional) OR `adapter.pages.useList` filter |
| `editor/hooks/useInlineAiShortcut.ts` | `useBlocks`, `usePages` | `adapter.pages.useList`, derive blocks from pages |

**Fix complexity**: 22 files. Many are 1-2 line edits (swap import). Estimated 6-8h.

---

## Section C — Databases: Store imports (35 files)

Databases has zero direct Convex imports — everything goes through
the store. Refactor is "swap `useStore()` for `useNotionAdapter()`"
mechanically, file by file.

### Top-level orchestration files

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/DatabaseBlock.tsx` | `useStore()` (full surface) | hub — derives + delegates to `adapter.databases.*`, `adapter.pages.useOne` |
| `databases/DatabasePage.tsx` | `useStore()` | `adapter.databases.useOne` |
| `databases/PropertyCell.tsx` | `useStore()` | `adapter.databases.setRowValue/updateProperty` |
| `databases/database-block/HeaderBar.tsx` | `useStore()` | `adapter.databases.update` |
| `databases/database-block/DatabaseMenu.tsx` | `useStore()` | `adapter.databases.trash/delete/duplicate` |

### Views (one per view type)

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/views/TableView.tsx` | `useStore()` (rows + props) | `adapter.databases.useRows`, `adapter.databases.useOne` |
| `databases/views/BoardView.tsx` | `useStore()` (rows + group prop) | (same) |
| `databases/views/ListView.tsx` | `useStore()` | (same) |
| `databases/views/GalleryView.tsx` | `useStore()` | (same) |
| `databases/views/CalendarView.tsx` | `useStore()` (rows + date prop) | (same) |
| `databases/views/FeedView.tsx` | `useStore()` | (same) |

### Property config

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/components/column-header/panels/EditPropertyPanel.tsx` | `useStore()` (full property edit) | `adapter.databases.updateProperty/deleteProperty/addSelectOption/...` |
| `databases/components/column-header/panels/registry.tsx` | `useStore()` | derive → adapter calls |
| `databases/components/column-header/useColumnHeaderActions.ts` | `useStore()` (sort/hide/reorder) | `adapter.databases.updateView` |
| `databases/components/column-header/items/index.tsx` | `useStore()` | (same) |
| `databases/components/property-config/*.tsx` (NumberConfig, SelectConfig, FormulaConfig, RelationConfig, …) | `useStore()` | `adapter.databases.updateProperty` |

### Property cells (one per property type)

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/property-cells/SelectOptionRow.tsx` | `useStore()` | `adapter.databases.addSelectOption/updateSelectOption` |
| `databases/property-cells/RelationCell.tsx` | `useStore()` | `adapter.databases.setRowValue`, `adapter.databases.useRows` (other db) |
| `databases/property-cells/*.tsx` (Text, Number, Date, Checkbox, MultiSelect, …) | `useStore()` | `adapter.databases.setRowValue` |

### Row interactions

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/row/*` | `useStore()` | `adapter.databases.addRow/deleteRow/reorderRows` |
| `databases/row-selection/components/RowSelectionToolbar.tsx` | `useStore()` | `adapter.databases.deleteRow` (bulk) |
| `databases/components/QuickCreateDialog.tsx` | `useStore()` | `adapter.databases.addRow`, `adapter.pages.update` |

### CSV / JSON I/O (already pure)

| File | Store fields | → Adapter method(s) |
|---|---|---|
| `databases/lib/import.ts` (or sibling files) | `useStore()` (write rows) | `adapter.databases.addRow`, `adapter.databases.setRowValue` |

**Fix complexity**: 35 files but ~70% are mechanical 2-3 line swaps. Hardest: `DatabaseBlock.tsx` + `EditPropertyPanel.tsx` (hubs). Estimated 10-15h.

**Render-prop slot to introduce in this phase**: `<RowDetailSheet components={{ PageEditor?: ComponentType }}>` + same on `<RowDetailDialog>`. Default resolves to bundled `@/slices/editor`. Wired in Phase 4.

---

## Section D — Store method surface (proves coverage)

This is the EXHAUSTIVE list of `useStore()` methods called from
editor + databases (derived from `grep -rIohE "const \{[^}]*\} =
useStore\(\)"`). Each row maps to its adapter method to PROVE the
adapter contract is complete — if a row has no target, the
adapter is missing a method.

### Reads (state slices)

| Store field | Used | → Adapter equivalent |
|---|--:|---|
| `pages` | 7 | `adapter.pages.useList` |
| `databases` | 3 | `adapter.databases.useList` |
| `user` | 2 | `adapter.user?.useCurrent` |
| `snapshots` | (via separate hook) | `adapter.snapshots?.useList` |
| `saving` | 1 | UI-local state — KEEP in store, don't move to adapter |
| `canUndo` / `canRedo` | (via undoRedo hook) | UI-local state — KEEP in store |

### Page writes

| Store method | Used | → Adapter method |
|---|--:|---|
| `addBlock` | 4 | `adapter.pages.addBlock` |
| `updateBlock` | 2 | `adapter.pages.updateBlock` |
| `deleteBlock` | 1 | `adapter.pages.deleteBlock` |
| `duplicateBlock` | 1 | `adapter.pages.duplicateBlock` |
| `reorderBlocks` | 1 | `adapter.pages.reorderBlocks` |
| `createPage` | 1 | `adapter.pages.create` |
| `updatePage` | 4 | `adapter.pages.update` |
| `deletePage` | 1 | `adapter.pages.delete` |
| `duplicatePage` | 1 | `adapter.pages.duplicate` |
| `movePage` | 1 | `adapter.pages.move` |
| `getPage` | 2 | `adapter.pages.useOne` (hook variant) |
| `childrenOf` | 1 | `adapter.pages.useChildren` |
| `toggleFavorite` | 1 | `adapter.pages.toggleFavorite` |

### Database writes

| Store method | Used | → Adapter method |
|---|--:|---|
| `addRow` | 2 | `adapter.databases.addRow` |
| `deleteRow` | 3 | `adapter.databases.deleteRow` |
| `setRowValue` | 4 | `adapter.databases.setRowValue` |
| `reorderRows` | 1 | `adapter.databases.reorderRows` |
| `addProperty` | 1 | `adapter.databases.addProperty` |
| `updateProperty` | 3 | `adapter.databases.updateProperty` |
| `deleteProperty` | 1 | `adapter.databases.deleteProperty` |
| `reorderProperties` | 1 | `adapter.databases.reorderProperties` |
| `addSelectOption` | 1 | `adapter.databases.addSelectOption` |
| `updateSelectOption` | 1 | `adapter.databases.updateSelectOption` |
| `addView` | 1 | `adapter.databases.addView` |
| `updateView` | 3 | `adapter.databases.updateView` |
| `setRelationTwoWay` | 1 | `adapter.databases.setRelationTwoWay` |
| `getDatabase` | 3 | `adapter.databases.useOne` (hook variant) |
| `updateDatabase` | 2 | `adapter.databases.update` |
| `trashDatabase` | 1 | `adapter.databases.trash` |

### Recents / snapshots

| Store method | Used | → Adapter method |
|---|--:|---|
| `pushRecent` | 1 | `adapter.recents?.push` |
| `snapshotIfNeeded` | (called from hooks) | `adapter.snapshots?.snapshotIfNeeded` |
| `restoreSnapshot` | (admin panel only) | `adapter.snapshots?.restore` |

### UI-local (stays in store, NOT in adapter)

| Store method | Reason |
|---|---|
| `undo` / `redo` / `canUndo` / `canRedo` | Browser-local action stack — no server needed |
| `saving` | Debounce indicator — derives from pending mutation count |
| `pushStructuralAction` | Internal — feeds undo stack |
| `setActiveWorkspace` (UI portion) | Selection state — actual write is `adapter.workspaces?.setActive` |

---

## Section E — Coverage verification (the gate)

Run after EACH refactor batch:

```bash
# Editor must have zero direct Convex
grep -rIn "from \"@convex/_generated" frontend/slices/editor && echo "FAIL" || echo "✓"

# Editor must have zero useMutation/useQuery/useAction/useConvex
grep -rIn -E "from \"convex/react" frontend/slices/editor && echo "FAIL" || echo "✓"

# Databases must have zero store imports
grep -rIn "from \"@/shared/lib/store" frontend/slices/databases && echo "FAIL" || echo "✓"

# Editor store imports allowed transitionally — track count
echo "editor store imports: $(grep -rIn "from \"@/shared/lib/store" frontend/slices/editor | wc -l)"

# Typecheck
pnpm typecheck
```

End of Phase 2 = first 2 lines `✓`.
End of Phase 3 = first 3 lines `✓` + editor count < 5 (most editor
store calls migrate alongside).
End of Phase 4 = all 4 lines `✓` + editor store count 0.

---

## Section F — Adapter method TOTAL count

| Namespace | Methods | Status |
|---|--:|---|
| `pages` | 14 (3 reads + 11 writes) | locked |
| `databases` | 22 (3 reads + 19 writes) | locked |
| `files` | 3 (reuses FilesAdapter) | locked |
| `ai?` | 1-2 (complete + completeStream optional) | locked |
| `presence?` | 2 (useRecentViewers, touch) | locked |
| `search?` | 2 (pages, databases) | locked |
| `user?` | 2 (useCurrent, useById) | locked |
| `workspaces?` | 4 | locked |
| `recents?` | 2 | locked |
| `snapshots?` | 3 | locked |
| **TOTAL** | **~55 methods** | — |

55 methods total. Each one is small (most are 1 Convex query/mutation
or 1 store-method wrap). The Convex adapter implementation is
estimated 250-350 LOC, the localStorage adapter 350-500 LOC (more
because it manages local store).

---

## Section G — Open contract questions deferred to Phase 1

Resolved in this Phase 0 via the "Lean" defaults documented in the
mega-lift plan:

1. ✅ Hooks for reads, promises for writes (no observable lib)
2. ✅ Registry object for `<NotionAppProvider components={...}>`
3. ✅ rr demo uses `seed.json` for initial data
4. ✅ localStorage adapter stubs single hard-coded workspaceId
5. ✅ v0.2.0 semver-major-style, document in CHANGELOG when Phase 4 lands

Still TBD (defer to Phase 1):

- Subscription cleanup primitive for non-hook subscribers (likely
  none needed — all current consumers are React-mounted)
- Conflict resolution strategy when multiple consumers mutate the
  same row offline (probably last-write-wins via Convex; localStorage
  adapter has no concurrent writers)

---

## Next action

**Phase 0 complete when**:
- [x] `frontend/slices/notion/adapter/types.ts` compiles
- [x] This doc covers every coupling site
- [x] G0 gate passed (typecheck green)

**Phase 1 starts at**: `frontend/slices/notion/adapter/context.tsx`
(provider) + `convexAdapter.tsx` (production impl, skip-listed) +
`localStorageAdapter.ts` (rr default).

Reference for both implementations: `frontend/slices/files/adapter/`
— that's the precedent shape this whole pattern generalises.
