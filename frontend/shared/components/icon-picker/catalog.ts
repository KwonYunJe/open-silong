/** Icon-picker catalog data — a separate entry point from `./index`.
 *
 *  Everything here is DATA or the picker body: the ~615-emoji catalog, the
 *  lucide/phosphor name groups, the lucide component map, and the inline
 *  picker itself. It is split out because the main barrel is imported by
 *  ~40 files that only want `DynamicIcon`, and a barrel re-export pulls the
 *  re-exported module into the importer's chunk whether or not the binding
 *  is used.
 *
 *  Import from here only in code that genuinely renders a picker, and prefer
 *  a lazy import when that code is behind a dialog or popover.
 *
 *  The heavy PHOSPHOR_ICONS component map is NOT here either — it is
 *  code-split via DynamicIcon's `React.lazy(./components/LazyPhosphor)`. */

export { IconPickerInline } from "./components/IconPickerInline";
export { EMOJI_GROUPS, ALL_EMOJIS } from "./lib/emoji-catalog";
export { LUCIDE_GROUPS, ALL_LUCIDE } from "./lib/lucide-catalog";
export { LUCIDE_ICONS, resolveLucideIcon, type LucideIconName } from "./lib/lucide-icons";
export { PHOSPHOR_GROUPS, ALL_PHOSPHOR } from "./lib/phosphor-catalog";
