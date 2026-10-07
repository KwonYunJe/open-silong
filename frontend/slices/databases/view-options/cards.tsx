import type { PropertyType } from "@/shared/types/domain";
import { MultiPropChecklist, PropPicker, Row, Section, Segmented, Toggle, isCategorical, useUpdate, type ViewOptionsProps } from "./atoms";

export function BoardOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  return (
    <>
      <Section title="그룹">
        <Row label="그룹 기준">
          <PropPicker
            value={view.groupBy}
            onPick={(id) => set({ groupBy: id ?? undefined })}
            props={db.properties.filter(isCategorical)}
            allowEmpty
            emptyLabel="그룹 없음 (자동)"
          />
        </Row>
        <Toggle
          label="빈 그룹 숨기기"
          checked={!!view.boardHideEmptyGroups}
          onChange={v => set({ boardHideEmptyGroups: v })}
        />
      </Section>
      <Section title="카드">
        <Row label="카드 크기">
          <Segmented
            value={view.boardCardSize ?? "medium"}
            onChange={v => set({ boardCardSize: v })}
            options={[
              { value: "small", label: "작게" },
              { value: "medium", label: "보통" },
              { value: "large", label: "크게" },
            ]}
          />
        </Row>
        <Row label="카드 색상 기준">
          <PropPicker
            value={view.boardColorByProp}
            onPick={(id) => set({ boardColorByProp: id ?? undefined })}
            props={db.properties.filter(isCategorical)}
            allowEmpty emptyLabel="없음"
          />
        </Row>
        <Row label="카드 속성" hint="제목 아래에 표시됩니다">
          <MultiPropChecklist
            db={db}
            value={view.boardCardProps}
            onChange={(ids) => set({ boardCardProps: ids })}
            filter={(p) => p.type !== "text"}
            max={6}
          />
        </Row>
      </Section>
    </>
  );
}

export function GalleryOptions({ db, view }: ViewOptionsProps) {
  const set = useUpdate(db, view);
  const imageTypes: PropertyType[] = ["files", "url"];
  return (
    <>
      <Section title="커버">
        <Row label="소스">
          <Segmented
            value={view.galleryCoverSource ?? "cover"}
            onChange={v => set({ galleryCoverSource: v })}
            options={[
              { value: "cover", label: "페이지 커버" },
              { value: "property", label: "속성" },
              { value: "none", label: "없음" },
            ]}
          />
        </Row>
        {view.galleryCoverSource === "property" && (
          <Row label="커버 속성">
            <PropPicker
              value={view.galleryCoverProp}
              onPick={(id) => set({ galleryCoverProp: id ?? undefined })}
              props={db.properties.filter(p => imageTypes.includes(p.type))}
              allowEmpty emptyLabel="—"
            />
          </Row>
        )}
        <Row label="비율">
          <Segmented
            value={view.galleryAspect ?? "video"}
            onChange={v => set({ galleryAspect: v })}
            options={[
              { value: "square", label: "1:1" },
              { value: "video", label: "16:9" },
              { value: "portrait", label: "3:4" },
            ]}
          />
        </Row>
        <Row label="맞춤">
          <Segmented
            value={view.galleryCoverFit ?? "cover"}
            onChange={v => set({ galleryCoverFit: v })}
            options={[
              { value: "cover", label: "채우기" },
              { value: "contain", label: "맞추기" },
            ]}
          />
        </Row>
      </Section>
      <Section title="카드">
        <Row label="크기">
          <Segmented
            value={view.gallerySize ?? "medium"}
            onChange={v => set({ gallerySize: v })}
            options={[
              { value: "small", label: "S" },
              { value: "medium", label: "M" },
              { value: "large", label: "L" },
            ]}
          />
        </Row>
        <Row label="표시할 속성">
          <MultiPropChecklist
            db={db}
            value={view.galleryCardProps}
            onChange={(ids) => set({ galleryCardProps: ids })}
            filter={(p) => p.type !== "text"}
            max={4}
          />
        </Row>
      </Section>
    </>
  );
}
