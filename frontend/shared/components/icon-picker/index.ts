/** Public barrel for the icon-picker module.
 *
 *  Portable to any Next.js + React 19 project. Consumers only need to
 *  install `lucide-react`, ship a Tailwind config that picks up the
 *  classes used here, and import:
 *    - `<DynamicIcon value={...} />` to render anywhere
 *    - `<IconPickerPopover value onChange ... />` to let users pick
 *    - `RawIcon` if you're rendering many icons in a grid (skip the
 *      global style subscription per cell — pass `style` once at the
 *      grid level and propagate). */

export { DynamicIcon, RawIcon, DEFAULT_ICON_SIZE } from "./components/DynamicIcon";
export { ICON_FILL_RATIO, renderSizeFor, type IconRenderKind } from "./lib/icon-render-config";
export { IconPickerPopover } from "./components/IconPicker";
export { PickerSkeleton } from "./components/PickerSkeleton";

export {
  parseIconValue,
  isLucideValue,
  isPhosphorValue,
  lucideValue,
  phosphorValue,
  withColor,
  LUCIDE_PREFIX,
  PHOSPHOR_PREFIX,
  type IconValue,
} from "./lib/parse";

// Catalog data (emoji list, icon-name groups, the lucide component map) and
// the bare inline picker live in `./catalog` — a SECOND entry point, not this
// barrel. A re-export here is not free: anything that imports `DynamicIcon`
// from this barrel gets every module the barrel names in its chunk, which put
// ~615 emoji and the icon-name lists in the dashboard shell for routes that
// never open a picker.

// Theming + style preference.
export { ICON_COLORS, type IconColor } from "./lib/colors";
export {
  useIconStyle,
  setIconStyle,
  readIconStyle,
} from "./lib/style-pref";

// Recents (lets host apps reset / read the ring outside the picker).
export { useRecentIcons, pushRecent, clearRecents } from "./lib/recents";

// Twemoji helper (CDN URL builder).
export { twemojiUrl } from "./lib/twemoji";

// Defaults — emoji-or-`lucide:Name` strings recognised everywhere.
export {
  DEFAULT_PAGE_ICON,
  DEFAULT_DATABASE_ICON,
  DEFAULT_ROW_ICON,
} from "./lib/defaults";
