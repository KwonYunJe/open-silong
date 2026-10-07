import { PropPicker, Row, Section, Segmented, Toggle, isCategorical, isDate, useUpdate, type ViewOptionsProps } from "./atoms";

export function CalendarOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="날짜 범위">
        <Row label="시작 날짜 속성">
          <PropPicker
            value={view.calendarDateProp}
            onPick={(id) => set({ calendarDateProp: id ?? undefined })}
            props={db.properties.filter(isDate)}
            allowEmpty emptyLabel="자동"
          />
        </Row>
        <Row label="종료 날짜 속성" hint="여러 날짜에 걸친 일정에 선택적으로 사용합니다">
          <PropPicker
            value={view.calendarEndProp}
            onPick={(id) => set({ calendarEndProp: id ?? undefined })}
            props={db.properties.filter(isDate)}
            allowEmpty emptyLabel="없음"
          />
        </Row>
      </Section>
      <Section title="표시">
        <Row label="보기">
          <Segmented
            value={view.calendarMode ?? "month"}
            onChange={v => set({ calendarMode: v })}
            options={[
              { value: "month", label: "월" },
              { value: "week", label: "주" },
            ]}
          />
        </Row>
        <Toggle
          label="기한 지남 / 날짜 없음 패널 표시"
          checked={view.calendarShowOverdue ?? true}
          onChange={v => set({ calendarShowOverdue: v })}
        />
        <Row label="일정 색상 기준">
          <PropPicker
            value={view.calendarColorByProp}
            onPick={(id) => set({ calendarColorByProp: id ?? undefined })}
            props={db.properties.filter(isCategorical)}
            allowEmpty emptyLabel="없음"
          />
        </Row>
        <Row label="한 주 시작 요일">
          <Segmented
            value={view.calendarWeekStart ?? 0}
            onChange={v => set({ calendarWeekStart: v })}
            options={[
              { value: 0, label: "일요일" },
              { value: 1, label: "월요일" },
            ]}
          />
        </Row>
        <Toggle
          label="주말 표시"
          checked={view.calendarShowWeekends ?? true}
          onChange={v => set({ calendarShowWeekends: v })}
        />
      </Section>
    </>
  );
}

export function TimelineOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="날짜 범위">
        <Row label="시작 속성">
          <PropPicker
            value={view.timelineStartProp}
            onPick={(id) => set({ timelineStartProp: id ?? undefined })}
            props={db.properties.filter(isDate)}
            allowEmpty emptyLabel="자동"
          />
        </Row>
        <Row label="종료 속성">
          <PropPicker
            value={view.timelineEndProp}
            onPick={(id) => set({ timelineEndProp: id ?? undefined })}
            props={db.properties.filter(isDate)}
            allowEmpty emptyLabel="시작과 동일"
          />
        </Row>
      </Section>
      <Section title="표시">
        <Row label="확대 수준">
          <Segmented
            value={view.timelineZoom ?? "month"}
            onChange={v => set({ timelineZoom: v })}
            options={[
              { value: "day", label: "일" },
              { value: "week", label: "주" },
              { value: "month", label: "월" },
              { value: "quarter", label: "분기" },
            ]}
          />
        </Row>
        <Row label="막대 색상 기준">
          <PropPicker
            value={view.timelineColorByProp}
            onPick={(id) => set({ timelineColorByProp: id ?? undefined })}
            props={db.properties.filter(isCategorical)}
            allowEmpty emptyLabel="없음"
          />
        </Row>
      </Section>
    </>
  );
}
