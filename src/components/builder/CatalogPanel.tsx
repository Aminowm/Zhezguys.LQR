import { useMemo, useState } from "react";
import { Search, Plus, Minus, Check, Package } from "lucide-react";
import { useLang, useT, DictKey } from "../../i18n";
import { CATALOG_BY_ID, CATS, Cat, CatalogItem, partMass, searchCatalog } from "../../robot/catalog";
import { massOfPart, newPartFromCatalog, RobotBuild } from "../../robot/build";

const fmtG = (g: number) => (g >= 10 ? g.toFixed(0) : g >= 1 ? g.toFixed(1) : g.toFixed(2));

export function useItemName() {
  const lang = useLang((s) => s.lang);
  return (c: CatalogItem) => (lang === "en" ? c.en : c.ru);
}

export default function CatalogPanel({ value: b, onChange, onSelect }: { value: RobotBuild; onChange(b: RobotBuild): void; onSelect(id: string): void }) {
  const t = useT();
  const name = useItemName();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat | "all">("all");
  const items = useMemo(() => searchCatalog(q, cat), [q, cat]);
  const bulk = b.bulk ?? {};

  const add = (c: CatalogItem) => {
    if (c.wheelD) {
      onChange({ ...b, wheelId: c.id, wheelDiameterMm: c.wheelD });
      return;
    }
    if (c.kind) {
      const z = c.kind === "colorSensor" || c.kind === "distanceSensor" || c.kind === "forceSensor" ? 6 : undefined;
      const p = newPartFromCatalog(c, 48 + (b.parts.length % 4) * 8, ((b.parts.length % 3) - 1) * 24, z);
      onChange({ ...b, parts: [...b.parts, p] });
      onSelect(p.id);
      return;
    }
    onChange({ ...b, bulk: { ...bulk, [c.id]: (bulk[c.id] ?? 0) + 1 } });
  };
  const setQty = (id: string, n: number) => {
    const next = { ...bulk };
    if (n <= 0) delete next[id];
    else next[id] = n;
    onChange({ ...b, bulk: next });
  };
  const setOverride = (id: string, g: number | null) => {
    const next = { ...(b.massOverride ?? {}) };
    if (g === null || !(g > 0)) delete next[id];
    else next[id] = g;
    onChange({ ...b, massOverride: next });
  };

  // "In the robot": placed parts grouped by catalog id + counted small parts
  const placedGroups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; num: string; n: number; mass: number; catalogId?: string }>();
    for (const p of b.parts) {
      const c = p.catalogId ? CATALOG_BY_ID[p.catalogId] : undefined;
      const key = p.catalogId ?? p.kind + ":" + p.id;
      const label = c ? name(c) : p.kind === "frame" ? name(CATALOG_BY_ID.chassis) : name(CATALOG_BY_ID.block);
      const g = m.get(key) ?? { key, label, num: c?.num ?? "", n: 0, mass: 0, catalogId: p.catalogId };
      g.n += 1;
      g.mass += massOfPart(p, b);
      m.set(key, g);
    }
    return [...m.values()];
  }, [b, name]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="search-pill">
        <Search size={16} aria-hidden />
        <input aria-label={t("builder.search")} placeholder={t("builder.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label={t("builder.categories")}>
        <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t("builder.cat.all")}</button>
        {CATS.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{t(`builder.cat.${c}` as DictKey)}</button>
        ))}
      </div>
      <div className="catalog-list" role="list">
        {items.length === 0 && <p className="small muted" style={{ padding: 8 }}>{t("builder.noResults")}</p>}
        {items.map((c) => {
          const qty = bulk[c.id] ?? 0;
          const inUse = c.wheelD ? b.wheelId === c.id : false;
          return (
            <div key={c.id} className="catalog-row" role="listitem">
              <div style={{ minWidth: 0 }}>
                <div className="catalog-name">{name(c)}</div>
                <div className="tiny muted num">
                  {c.num ? `#${c.num} · ` : ""}≈ {fmtG(partMass(c.id, b.massOverride))} g
                  {!c.kind && !c.wheelD ? ` · ${t("builder.counted")}` : ""}
                </div>
              </div>
              {qty > 0 && <span className="pill num">×{qty}</span>}
              <button
                type="button"
                className={"icon-btn sm round" + (inUse ? " active" : "")}
                aria-label={c.wheelD ? t("builder.useWheels") : t("builder.add")}
                title={c.wheelD ? t("builder.useWheels") : t("builder.add")}
                onClick={() => add(c)}
              >
                {inUse ? <Check size={16} /> : <Plus size={16} />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="label row" style={{ gap: 6, marginTop: 4 }}><Package size={15} /> {t("builder.inRobot")}</div>
      <div className="bom">
        {placedGroups.map((g) => (
          <div key={g.key} className="bom-row">
            <span className="catalog-name" style={{ flex: 1 }}>{g.label}{g.num && <span className="tiny muted"> #{g.num}</span>}</span>
            <span className="num small">×{g.n}</span>
            <span className="num small muted" style={{ width: 64, textAlign: "right" }}>{fmtG(g.mass)} g</span>
          </div>
        ))}
        {Object.entries(bulk).map(([id, n]) => {
          const c = CATALOG_BY_ID[id];
          if (!c) return null;
          return (
            <div key={id} className="bom-row">
              <span className="catalog-name" style={{ flex: 1 }}>{name(c)}<span className="tiny muted"> #{c.num}</span></span>
              <span className="qty">
                <button type="button" aria-label="−" onClick={() => setQty(id, n - 1)}><Minus size={13} /></button>
                <input aria-label={name(c)} className="num" value={n} onChange={(e) => setQty(id, Math.max(0, Math.min(999, Number(e.target.value) || 0)))} />
                <button type="button" aria-label="+" onClick={() => setQty(id, n + 1)}><Plus size={13} /></button>
              </span>
              <span className="unit-input" style={{ width: 84 }} title={t("builder.weighed")}>
                <input
                  className="input num"
                  style={{ minHeight: 30, padding: "4px 26px 4px 8px", fontSize: 12.5 }}
                  type="number"
                  step="0.01"
                  aria-label={t("builder.weighed")}
                  value={b.massOverride?.[id] ?? c.mass}
                  onChange={(e) => setOverride(id, e.target.value === "" ? null : Number(e.target.value))}
                />
                <span style={{ right: 8, fontSize: 11 }}>g</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
