"use client";

import * as React from "react";
import { LUCIDE_ICONS, FallbackLucideIcon } from "../lib/lucide-icons";

/** Isolated so the 255-component lucide map in `lib/lucide-icons.ts` is
 *  code-split into its own chunk instead of shipping eagerly everywhere
 *  `DynamicIcon` is rendered.
 *
 *  That map is the icon-PICKER's catalog, but `DynamicIcon` imported it
 *  statically, so any page that rendered a single icon paid for all 255 —
 *  including `/share/[id]` and `/site/[ws]`, the anonymous read-only routes
 *  that are supposed to be the leanest in the app. Measured ~25 KB gzipped.
 *
 *  Same treatment `LazyPhosphor` already gets, and the same trade: the first
 *  lucide icon on a page renders one frame late, then the chunk is cached and
 *  every subsequent render is synchronous. Emoji icons — the common case for
 *  page icons — now cost nothing at all. */
export default function LazyLucide({ name, renderSize }: { name: string; renderSize?: number }) {
  const Cmp = LUCIDE_ICONS[name] ?? FallbackLucideIcon;
  if (Cmp === FallbackLucideIcon && process.env.NODE_ENV !== "production") {
    console.warn(`[DynamicIcon] Unknown lucide icon: "${name}". Falling back to FileText.`);
  }
  return renderSize !== undefined
    ? <Cmp size={renderSize} style={{ width: renderSize, height: renderSize }} />
    : <Cmp className="h-[1em] w-[1em]" />;
}
