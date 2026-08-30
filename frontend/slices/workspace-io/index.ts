// The dialog component is intentionally NOT re-exported. `WorkspaceIOProvider`
// lazy-loads it, but a value re-export here put it back in the static graph of
// every file that imports `useWorkspaceIO` — the sidebar, page actions, the
// library bulk bar and the graph route — which is the whole dashboard shell.
// Type-only export costs nothing at runtime.
export type { WorkspaceIOTab } from "./components/WorkspaceIODialog";
export { WorkspaceIOProvider, useWorkspaceIO } from "./components/WorkspaceIOProvider";
export { buildSelectionExport } from "./lib/buildExport";
