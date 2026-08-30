export { AdminPanel } from "./components/AdminPanel";
// `useAdminRole` moved to `@/shared/hooks/useAdminRole`. It is a 40-line
// Convex-query hook, but four non-admin call sites (sidebar, mobile nav,
// setup, the admin route itself) imported it THROUGH this barrel — and the
// barrel also exports AdminPanel, so the whole admin surface was reachable
// from the dashboard shell's static graph. Keeping the hook out of here is
// what lets AdminPanel stay behind its dynamic import.
