import { MultiPropChecklist, PropPicker, Row, Section, Segmented, Toggle, isCategorical, isNumeric, useUpdate, type ViewOptionsProps } from "./atoms";

export function TableOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <Section title="레이아웃">
      <Row label="셀 텍스트 줄바꿈" hint="긴 텍스트를 여러 줄로 표시합니다">
        <Toggle label="" checked={!!view.tableWrapCells} onChange={v => set({ tableWrapCells: v })} />
      </Row>
      <Row label="행 높이">
        <Segmented
          value={view.tableRowHeight ?? "medium"}
          onChange={v => set({ tableRowHeight: v })}
          options={[
            { value: "short", label: "낮음" },
            { value: "medium", label: "보통" },
            { value: "tall", label: "높음" },
          ]}
        />
      </Row>
    </Section>
  );
}

export function ListOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="밀도">
        <Segmented
          value={view.listDensity ?? "comfortable"}
          onChange={v => set({ listDensity: v })}
          options={[
            { value: "compact", label: "좁게" },
            { value: "comfortable", label: "여유롭게" },
          ]}
        />
      </Section>
      <Section title="요약 속성">
        <MultiPropChecklist
          db={db}
          value={view.listSummaryProps}
          onChange={(ids) => set({ listSummaryProps: ids })}
          filter={(p) => p.type !== "text"}
          max={4}
        />
      </Section>
    </>
  );
}

export function FeedOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="시간">
        <Row label="정렬 기준">
          <Segmented
            value={view.feedTimestamp ?? "updatedAt"}
            onChange={v => set({ feedTimestamp: v })}
            options={[
              { value: "updatedAt", label: "수정 시간" },
              { value: "createdAt", label: "생성 시간" },
            ]}
          />
        </Row>
      </Section>
      <Section title="밀도">
        <Segmented
          value={view.feedDensity ?? "comfortable"}
          onChange={v => set({ feedDensity: v })}
          options={[
            { value: "compact", label: "좁게" },
            { value: "comfortable", label: "여유롭게" },
          ]}
        />
      </Section>
      <Section title="요약 속성">
        <MultiPropChecklist
          db={db}
          value={view.feedSummaryProps}
          onChange={(ids) => set({ feedSummaryProps: ids })}
          filter={(p) => p.type !== "text"}
          max={4}
        />
      </Section>
    </>
  );
}

export function MapOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="좌표">
        <Row label="위도">
          <PropPicker
            value={view.mapLatProp}
            onPick={(id) => set({ mapLatProp: id ?? undefined })}
            props={db.properties.filter(isNumeric)}
            allowEmpty emptyLabel="자동"
          />
        </Row>
        <Row label="경도">
          <PropPicker
            value={view.mapLngProp}
            onPick={(id) => set({ mapLngProp: id ?? undefined })}
            props={db.properties.filter(isNumeric)}
            allowEmpty emptyLabel="자동"
          />
        </Row>
      </Section>
      <Section title="핀">
        <Row label="핀 색상 기준">
          <PropPicker
            value={view.mapPinColorProp}
            onPick={(id) => set({ mapPinColorProp: id ?? undefined })}
            props={db.properties.filter(isCategorical)}
            allowEmpty emptyLabel="단일 색상"
          />
        </Row>
        <Toggle
          label="지도 아래에 목록 표시"
          checked={view.mapShowList ?? true}
          onChange={v => set({ mapShowList: v })}
        />
      </Section>
    </>
  );
}
