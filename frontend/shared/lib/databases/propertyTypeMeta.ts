/** Single source of truth for property-type metadata.
 *
 *  Lives in `shared/` (not the databases slice) because both the slice
 *  AND `shared/lib/store/databaseActions/*` need it. The previous home
 *  (`@/slices/databases/lib/propertyTypeMeta`) inverted the shared →
 *  slice import direction.
 *
 *  Add a new PropertyType variant? Add ONE row here and every consumer
 *  (label, icon, default name, slash-group) updates automatically.
 */

import {
  Type, Hash, ChevronDown, Tags, Circle, Calendar, User, CheckSquare,
  Link2, Mail, Phone, Paperclip, ArrowUpRight, Sigma, Calculator, Clock,
  UserCheck, Fingerprint, MousePointer, MapPin, ShieldCheck,
  Sparkles, Languages, Lightbulb, Wand2,
  type LucideIcon,
} from "lucide-react";
import type { PropertyType } from "@/shared/types/domain";

export type PropertyTypeCategory =
  | "text" | "numeric" | "option" | "date" | "people"
  | "boolean" | "contact" | "media" | "relational" | "computed"
  | "system" | "automation" | "location" | "wiki" | "ai";

export interface PropertyTypeMeta {
  /** UI label shown in menus + headers. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Default name when adding a new column of this type. */
  defaultName: string;
  /** Bucket for grouping in the slash menu / change-type submenu. */
  category: PropertyTypeCategory;
  /** Notion-canonical API name (matches user's reference JSON). */
  apiName: string;
  /** True when value is computed server / from page metadata —
   *  cell renders read-only. */
  readOnlyValue?: boolean;
}

/** Master table — every PropertyType variant. */
export const PROPERTY_TYPE_META: Record<PropertyType, PropertyTypeMeta> = {
  text:             { label: "텍스트",             icon: Type,         defaultName: "Text",         category: "text",        apiName: "rich_text" },
  number:           { label: "숫자",           icon: Hash,         defaultName: "Number",       category: "numeric",     apiName: "number" },
  select:           { label: "선택",           icon: ChevronDown,  defaultName: "Select",       category: "option",      apiName: "select" },
  multi_select:     { label: "다중 선택",     icon: Tags,         defaultName: "Tags",         category: "option",      apiName: "multi_select" },
  status:           { label: "상태",           icon: Circle,       defaultName: "Status",       category: "option",      apiName: "status" },
  date:             { label: "날짜",             icon: Calendar,     defaultName: "Date",         category: "date",        apiName: "date" },
  person:           { label: "사용자",           icon: User,         defaultName: "Person",       category: "people",      apiName: "people" },
  checkbox:         { label: "체크박스",         icon: CheckSquare,  defaultName: "Done",         category: "boolean",     apiName: "checkbox" },
  url:              { label: "URL",              icon: Link2,        defaultName: "URL",          category: "contact",     apiName: "url" },
  email:            { label: "이메일",            icon: Mail,         defaultName: "Email",        category: "contact",     apiName: "email" },
  phone:            { label: "전화번호",            icon: Phone,        defaultName: "Phone",        category: "contact",     apiName: "phone_number" },
  files:            { label: "파일",            icon: Paperclip,    defaultName: "Files",        category: "media",       apiName: "files" },
  relation:         { label: "관계",         icon: ArrowUpRight, defaultName: "Relation",     category: "relational",  apiName: "relation" },
  rollup:           { label: "롤업",           icon: Sigma,        defaultName: "Rollup",       category: "computed",    apiName: "rollup",          readOnlyValue: true },
  formula:          { label: "수식",          icon: Calculator,   defaultName: "Formula",      category: "computed",    apiName: "formula",         readOnlyValue: true },
  created_time:     { label: "생성 시간",     icon: Clock,        defaultName: "Created",      category: "system",      apiName: "created_time",    readOnlyValue: true },
  created_by:       { label: "생성자",       icon: UserCheck,    defaultName: "Created by",   category: "system",      apiName: "created_by",      readOnlyValue: true },
  last_edited_time: { label: "마지막 수정 시간", icon: Clock,        defaultName: "Last edited",  category: "system",      apiName: "last_edited_time",readOnlyValue: true },
  last_edited_by:   { label: "마지막 수정자",   icon: UserCheck,    defaultName: "Last edited by", category: "system",    apiName: "last_edited_by",  readOnlyValue: true },
  unique_id:        { label: "고유 ID",        icon: Fingerprint,  defaultName: "ID",           category: "system",      apiName: "unique_id",       readOnlyValue: true },
  button:           { label: "버튼",           icon: MousePointer, defaultName: "Action",       category: "automation",  apiName: "button" },
  place:            { label: "장소",            icon: MapPin,       defaultName: "Place",        category: "location",    apiName: "place" },
  verification:     { label: "검증",     icon: ShieldCheck,  defaultName: "Verified",     category: "wiki",        apiName: "verification" },
  ai_summary:       { label: "AI 요약",       icon: Sparkles,     defaultName: "AI summary",   category: "ai",          apiName: "ai_summary",      readOnlyValue: true },
  ai_translation:   { label: "AI 번역",   icon: Languages,    defaultName: "Translation",  category: "ai",          apiName: "ai_translation",  readOnlyValue: true },
  ai_keywords:      { label: "AI 키워드",      icon: Lightbulb,    defaultName: "Keywords",     category: "ai",          apiName: "ai_keywords",     readOnlyValue: true },
  ai_custom:        { label: "AI 사용자 지정",        icon: Wand2,        defaultName: "AI autofill",  category: "ai",          apiName: "ai_custom",       readOnlyValue: true },
};

/** Convenience derived maps (computed once at module-load). */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = Object.fromEntries(
  (Object.entries(PROPERTY_TYPE_META) as [PropertyType, PropertyTypeMeta][])
    .map(([k, v]) => [k, v.label]),
) as Record<PropertyType, string>;

export const PROPERTY_TYPE_ICONS: Record<PropertyType, LucideIcon> = Object.fromEntries(
  (Object.entries(PROPERTY_TYPE_META) as [PropertyType, PropertyTypeMeta][])
    .map(([k, v]) => [k, v.icon]),
) as Record<PropertyType, LucideIcon>;

export function defaultPropName(type: PropertyType): string {
  return PROPERTY_TYPE_META[type].defaultName;
}

/** All known PropertyType keys, in declaration order. */
export const PROPERTY_TYPES: PropertyType[] = Object.keys(PROPERTY_TYPE_META) as PropertyType[];
