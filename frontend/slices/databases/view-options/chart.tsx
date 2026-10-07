import { Input } from "@/shared/ui/input";
import { PropPicker, Row, Section, Segmented, Toggle, useUpdate, type ViewOptionsProps } from "./atoms";

export function ChartOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="헤더">
        <Row label="차트 제목">
          <Input value={view.chartTitle ?? ""} placeholder="선택 사항" onChange={(e) => set({ chartTitle: e.target.value })} className="h-7 text-xs" />
        </Row>
      </Section>
      <Section title="축">
        <Row label="X축">
          <PropPicker
            value={view.chartXProp}
            onPick={(id) => set({ chartXProp: id ?? undefined })}
            props={db.properties}
            allowEmpty emptyLabel="자동"
          />
        </Row>
        <Row label="X축 이름" hint="기본값은 속성 이름입니다">
          <Input value={view.chartXLabel ?? ""} placeholder={db.properties.find(p => p.id === view.chartXProp)?.name ?? ""} onChange={(e) => set({ chartXLabel: e.target.value })} className="h-7 text-xs" />
        </Row>
        <Row label="Y축 이름">
          <Input value={view.chartYLabel ?? ""} placeholder={view.chartAggregate === "count" || !view.chartAggregate ? "개수" : (db.properties.find(p => p.id === view.chartYProp)?.name ?? "값")} onChange={(e) => set({ chartYLabel: e.target.value })} className="h-7 text-xs" />
        </Row>
      </Section>
      <Section title="표시">
        <Toggle label="범례 표시" checked={view.chartShowLegend ?? true} onChange={v => set({ chartShowLegend: v })} />
        <Toggle label="격자 표시" checked={view.chartShowGrid ?? true} onChange={v => set({ chartShowGrid: v })} />
        <Toggle label="값 표시" checked={view.chartShowValues ?? false} onChange={v => set({ chartShowValues: v })} />
        <Row label="높이">
          <Segmented
            value={view.chartHeight ?? "medium"}
            onChange={v => set({ chartHeight: v })}
            options={[
              { value: "small", label: "S" },
              { value: "medium", label: "M" },
              { value: "large", label: "L" },
            ]}
          />
        </Row>
      </Section>
      <Section title="정렬">
        <Row label="정렬 기준">
          <Segmented
            value={view.chartSortBy ?? "value"}
            onChange={v => set({ chartSortBy: v })}
            options={[
              { value: "name", label: "이름" },
              { value: "value", label: "값" },
            ]}
          />
        </Row>
        <Row label="방향">
          <Segmented
            value={view.chartSortDir ?? "desc"}
            onChange={v => set({ chartSortDir: v })}
            options={[
              { value: "asc", label: "오름차순" },
              { value: "desc", label: "내림차순" },
            ]}
          />
        </Row>
      </Section>
      <Section title="데이터">
        <Row label="상위 N개 항목" hint="0 = 전체">
          <Input
            type="number"
            min={0} max={50}
            value={view.chartTopN ?? 0}
            onChange={(e) => set({ chartTopN: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
            className="h-7 text-xs"
          />
        </Row>
        <Row label="소수 자릿수">
          <Segmented
            value={view.chartDecimals ?? 0}
            onChange={v => set({ chartDecimals: v })}
            options={[
              { value: 0, label: "0" },
              { value: 1, label: "0.1" },
              { value: 2, label: "0.01" },
            ]}
          />
        </Row>
        <Row label="색상 팔레트">
          <Segmented
            value={view.chartPalette ?? "warm"}
            onChange={v => set({ chartPalette: v })}
            options={[
              { value: "warm", label: "따뜻한 색" },
              { value: "cool", label: "차가운 색" },
              { value: "rainbow", label: "무지개" },
              { value: "mono", label: "단색" },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}
