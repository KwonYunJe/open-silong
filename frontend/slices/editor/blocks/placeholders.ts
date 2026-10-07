/** Block placeholder strings — single source for both top-level
 *  (`BlockBody`) and nested (`NestedBlock`) renderers. Empty string
 *  hides the placeholder (used for non-text blocks like dividers,
 *  embeds, layout containers).
 */

import type { BlockType } from "@/shared/types/domain";

export const TOP_LEVEL_PLACEHOLDERS: Record<BlockType, string> = {
  paragraph: "입력하거나 / 를 눌러 명령어를 선택하세요",
  h1: "제목 1", h2: "제목 2", h3: "제목 3", h4: "제목 4",
  h5: "제목 5", h6: "제목 6",
  todo: "할 일", bullet: "목록 항목", numbered: "목록 항목",
  quote: "인용", code: "코드를 입력하세요…", callout: "내용을 강조하세요",
  divider: "", page: "", database: "",
  columns2: "", columns3: "", columns4: "", columns5: "",
  toggle: "", image: "", equation: "", table: "",
  embed: "", button: "", synced: "",
  toc: "", audio: "", video: "",
};

/** Nested context — terser placeholders fit narrower columns / toggles. */
export const NESTED_PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  paragraph: "입력하세요…",
  h1: "제목 1", h2: "제목 2", h3: "제목 3", h4: "제목 4",
  h5: "제목 5", h6: "제목 6",
  todo: "할 일", bullet: "목록 항목", numbered: "목록 항목",
  quote: "인용", callout: "콜아웃…",
};
