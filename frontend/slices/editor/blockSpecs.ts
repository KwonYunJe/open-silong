import { BlockType } from "@/shared/types/domain";
import {
  Type, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  ListTodo, List, ListOrdered,
  Quote, Code, Minus, Lightbulb, FileText, Database, Columns2, Columns3, Columns4,
  ChevronRight, Image, Sigma, Table, Tv2, MousePointer, RefreshCw,
  ListTree, Mic, Video,
} from "lucide-react";

export interface BlockSpec {
  type: BlockType;
  label: string;
  hint: string;
  icon: any;
  keywords: string[];
}

export const BLOCK_SPECS: BlockSpec[] = [
  { type: "paragraph", label: "텍스트", hint: "일반 텍스트를 입력합니다", icon: Type, keywords: ["text", "paragraph", "p"] },
  { type: "h1", label: "제목 1", hint: "가장 큰 섹션 제목", icon: Heading1, keywords: ["h1", "heading", "title"] },
  { type: "h2", label: "제목 2", hint: "중간 크기의 섹션 제목", icon: Heading2, keywords: ["h2", "heading"] },
  { type: "h3", label: "제목 3", hint: "작은 섹션 제목", icon: Heading3, keywords: ["h3", "heading"] },
  { type: "h4", label: "제목 4", hint: "더 작은 섹션 제목", icon: Heading4, keywords: ["h4", "heading"] },
  { type: "h5", label: "제목 5", hint: "더욱 작은 제목", icon: Heading5, keywords: ["h5", "heading"] },
  { type: "h6", label: "제목 6", hint: "가장 작은 제목", icon: Heading6, keywords: ["h6", "heading"] },
  { type: "todo", label: "할 일", hint: "체크박스로 할 일을 관리합니다", icon: ListTodo, keywords: ["todo", "task", "check"] },
  { type: "bullet", label: "글머리 기호 목록", hint: "글머리 기호 목록을 만듭니다", icon: List, keywords: ["bullet", "list", "ul"] },
  { type: "numbered", label: "번호 매기기 목록", hint: "번호가 있는 목록을 만듭니다", icon: ListOrdered, keywords: ["numbered", "ol"] },
  { type: "toggle", label: "토글", hint: "접고 펼칠 수 있는 영역을 만듭니다", icon: ChevronRight, keywords: ["toggle", "collapse", "expand", "accordion"] },
  { type: "columns2", label: "2열", hint: "두 개의 열을 나란히 배치합니다", icon: Columns2, keywords: ["columns", "2 columns", "column", "layout", "side"] },
  { type: "columns3", label: "3열", hint: "세 개의 열을 배치합니다", icon: Columns3, keywords: ["columns", "3 columns", "column", "layout"] },
  { type: "columns4", label: "4열", hint: "네 개의 열을 배치합니다", icon: Columns4, keywords: ["columns", "4 columns", "column", "layout"] },
  { type: "columns5", label: "5열", hint: "다섯 개의 열을 배치합니다", icon: Columns4, keywords: ["columns", "5 columns", "column", "layout"] },
  { type: "quote", label: "인용", hint: "인용문을 작성합니다", icon: Quote, keywords: ["quote"] },
  { type: "callout", label: "콜아웃", hint: "내용을 강조해서 표시합니다", icon: Lightbulb, keywords: ["callout", "info"] },
  { type: "code", label: "코드", hint: "구문 강조가 적용되는 코드 블록", icon: Code, keywords: ["code"] },
  { type: "equation", label: "수식", hint: "LaTeX/KaTeX 수식을 입력합니다", icon: Sigma, keywords: ["equation", "math", "latex", "katex", "formula"] },
  { type: "image", label: "이미지", hint: "URL의 이미지를 삽입합니다", icon: Image, keywords: ["image", "img", "photo", "picture", "url"] },
  { type: "divider", label: "구분선", hint: "콘텐츠 사이에 구분선을 추가합니다", icon: Minus, keywords: ["divider", "hr"] },
  { type: "page", label: "페이지", hint: "하위 페이지를 만들거나 삽입합니다", icon: FileText, keywords: ["page", "subpage", "doc"] },
  { type: "database", label: "데이터베이스 — 인라인", hint: "현재 페이지 안에 새 데이터베이스를 만듭니다", icon: Database, keywords: ["database", "db", "new", "inline", "kanban", "board", "embed"] },
  { type: "table", label: "간단한 표", hint: "일반 표를 만듭니다. 나중에 데이터베이스로 변환할 수 있습니다", icon: Table, keywords: ["table", "grid", "spreadsheet", "rows", "columns"] },
  { type: "embed", label: "임베드", hint: "YouTube · Vimeo · Loom · Figma · CodePen · Spotify", icon: Tv2, keywords: ["embed", "iframe", "video", "youtube", "vimeo", "loom", "figma", "codepen", "spotify"] },
  { type: "button", label: "버튼", hint: "URL 또는 페이지로 이동하는 버튼", icon: MousePointer, keywords: ["button", "cta", "link", "action"] },
  { type: "synced", label: "동기화 블록", hint: "여러 위치에서 동일하게 편집되는 재사용 블록", icon: RefreshCw, keywords: ["synced", "sync", "reusable", "shared", "transclusion", "embed"] },
  { type: "toc", label: "목차", hint: "페이지 제목을 기준으로 목차를 자동 생성합니다", icon: ListTree, keywords: ["toc", "table of contents", "outline", "nav", "anchors"] },
  { type: "audio", label: "오디오", hint: "오디오 파일을 업로드하거나 삽입합니다", icon: Mic, keywords: ["audio", "sound", "mp3", "wav", "voice", "music"] },
  { type: "video", label: "비디오", hint: "비디오 파일을 업로드하거나 삽입합니다", icon: Video, keywords: ["video", "mp4", "mov", "webm", "movie", "clip"] },
];
