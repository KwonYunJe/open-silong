/* Seed data — the placeholder profile the store boots with before Convex
 * hydrates. Everything else that used to live here (demo pages, a demo
 * tasks database, seedWorkspace/seedPreferences) had zero consumers and was
 * deleted 2026-08-30. */

import type { UserProfile } from "@/shared/types/domain";

export const seedUser: UserProfile = {
  id: "user_me",
  name: "Alex Rivera",
  email: "alex@acme.studio",
  bio: "Designer & maker. Likes long walks and short meetings.",
  icon: "🦊",
  color: "24 90% 56%",
};
