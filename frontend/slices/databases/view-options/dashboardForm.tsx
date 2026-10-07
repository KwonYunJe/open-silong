import { Input } from "@/shared/ui/input";
import { MultiPropChecklist, Row, Section, isCategorical, useUpdate, type ViewOptionsProps } from "./atoms";

export function DashboardOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="KPI 카드">
        <div className="text-[10px] text-muted-foreground -mt-1">강조해서 표시할 숫자 또는 체크박스 속성</div>
        <MultiPropChecklist
          db={db}
          value={view.dashboardKPIs}
          onChange={(ids) => set({ dashboardKPIs: ids })}
          filter={(p) => p.type === "number" || p.type === "checkbox"}
          max={6}
        />
      </Section>
      <Section title="그룹 분석">
        <div className="text-[10px] text-muted-foreground -mt-1">선택 / 상태 속성</div>
        <MultiPropChecklist
          db={db}
          value={view.dashboardBreakdowns}
          onChange={(ids) => set({ dashboardBreakdowns: ids })}
          filter={isCategorical}
          max={6}
        />
      </Section>
      <Section title="최근 활동">
        <Row label="표시 개수">
          <Input
            type="number" min={1} max={20}
            value={view.dashboardRecentLimit ?? 5}
            onChange={(e) => set({ dashboardRecentLimit: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })}
            className="h-7 text-xs"
          />
        </Row>
      </Section>
    </>
  );
}

export function FormOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="헤더">
        <Row label="제목">
          <Input
            value={view.formTitle ?? ""}
            placeholder={db.name}
            onChange={(e) => set({ formTitle: e.target.value })}
            className="h-7 text-xs"
          />
        </Row>
        <Row label="설명">
          <textarea
            value={view.formDescription ?? ""}
            placeholder="폼을 작성하여 새 행을 추가하세요."
            onChange={(e) => set({ formDescription: e.target.value })}
            rows={2}
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </Row>
        <Row label="제출 완료 메시지">
          <Input
            value={view.formSuccessMessage ?? ""}
            placeholder="제출되었습니다!"
            onChange={(e) => set({ formSuccessMessage: e.target.value })}
            className="h-7 text-xs"
          />
        </Row>
      </Section>
      <Section title="필드">
        <div className="text-[10px] text-muted-foreground -mt-1">
          폼에 표시할 필드입니다. 필수 여부는 폼 페이지의 편집 버튼에서 설정할 수 있습니다.
        </div>
        <MultiPropChecklist
          db={db}
          value={view.formShownProps}
          onChange={(ids) => set({ formShownProps: ids })}
          filter={(p) => !["rollup", "formula", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id", "relation", "files"].includes(p.type)}
        />
      </Section>
    </>
  );
}
