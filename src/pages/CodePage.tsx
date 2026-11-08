import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { FileCode2, Download, Copy, RotateCcw, Play, Plus, Check } from "lucide-react";
import { useApp } from "../state/app";
import { useT } from "../i18n";
import CodeEditor from "../components/CodeEditor";
import { buildProgram, CodeFileId, DEFAULT_FILES, FILE_NAMES, FILE_ORDER } from "../code/defaults";
import { newProgram } from "../state/workspace";

export default function CodePage() {
  const t = useT();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { ws, update } = useApp();
  const [copied, setCopied] = useState(false);
  const fileParam = params.get("f") as CodeFileId | null;
  const progParam = params.get("p");
  const line = Number(params.get("line")) || null;

  const sel = useMemo(() => {
    if (!ws) return null;
    if (fileParam && FILE_ORDER.includes(fileParam)) return { kind: "file" as const, id: fileParam };
    const p = ws.programs.find((x) => x.id === progParam) ?? ws.programs[0];
    return p ? { kind: "program" as const, id: p.id } : { kind: "file" as const, id: "lqr" as CodeFileId };
  }, [ws, fileParam, progParam]);

  if (!ws || !sel) return null;
  const program = sel.kind === "program" ? ws.programs.find((p) => p.id === sel.id)! : ws.programs[0];
  const value = sel.kind === "file" ? ws.files[sel.id] : program.code;
  const onChange = (v: string) =>
    update((w) =>
      sel.kind === "file"
        ? { ...w, files: { ...w.files, [sel.id]: v } }
        : { ...w, programs: w.programs.map((p) => (p.id === sel.id ? { ...p, code: v } : p)) },
    );

  const combined = () => buildProgram(ws.files, program?.code ?? "").code;
  const fileTitle = sel.kind === "file" ? FILE_NAMES[sel.id] : program.name;
  const exportName = (program?.name || "program").replace(/[^\w\-]+/g, "_").toLowerCase() + ".py";

  const item = (active: boolean, onClick: () => void, label: string, dot?: string) => (
    <button
      key={label}
      onClick={onClick}
      className="btn ghost sm"
      aria-current={active ? "page" : undefined}
      style={{ justifyContent: "flex-start", width: "100%", background: active ? "var(--primary-soft)" : undefined, color: active ? "var(--primary)" : undefined }}
    >
      {dot ? <span className="dot" style={{ background: dot }} /> : <FileCode2 size={15} />} {label}
    </button>
  );

  return (
    <div className="page wide">
      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: 16 }} className="code-grid">
        <aside className="card flat" style={{ padding: 10, alignSelf: "start" }}>
          <div className="label" style={{ padding: "6px 8px" }}>{t("code.files")}</div>
          <div className="stack" style={{ gap: 2 }}>
            {FILE_ORDER.map((f) => item(sel.kind === "file" && sel.id === f, () => setParams({ f }), FILE_NAMES[f]))}
          </div>
          <div className="divider" style={{ margin: "10px 0" }} />
          <div className="row spread" style={{ padding: "0 8px" }}>
            <span className="label">{t("code.programs")}</span>
            <button
              className="icon-btn sm"
              aria-label={t("table.addProgram")}
              onClick={() => {
                const p = newProgram(ws.programs.length, t("table.program", { n: ws.programs.length + 1 }));
                update((w) => ({ ...w, programs: [...w.programs, p] }));
                setParams({ p: p.id });
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {ws.programs.map((p) => item(sel.kind === "program" && sel.id === p.id, () => setParams({ p: p.id }), p.name, p.color))}
          </div>
        </aside>
        <motion.section key={sel.kind + sel.id} className="stack" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className="row spread wrap">
            <div>
              <h2 style={{ margin: 0 }}>{fileTitle}</h2>
              <div className="tiny muted">{t("code.order")}</div>
            </div>
            <div className="row wrap">
              {sel.kind === "file" && (
                <button
                  className="btn sm"
                  onClick={() => {
                    if (confirm(t("code.resetConfirm", { file: FILE_NAMES[sel.id] }))) onChange(DEFAULT_FILES[sel.id]);
                  }}
                >
                  <RotateCcw size={15} /> {t("code.resetFile")}
                </button>
              )}
              <button
                className="btn sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(combined());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                title={t("code.exportHint")}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("common.copied") : t("common.copy")}
              </button>
              <button
                className="btn sm"
                title={t("code.exportHint")}
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([combined()], { type: "text/x-python" }));
                  a.download = exportName;
                  a.click();
                }}
              >
                <Download size={15} /> {t("code.export")}
              </button>
              <button className="btn primary sm" onClick={() => nav("/table")}>
                <Play size={15} /> {t("code.runOnTable")}
              </button>
            </div>
          </div>
          <CodeEditor value={value} onChange={onChange} height="calc(100vh - 210px)" errorLine={line} label={fileTitle} />
          <p className="tiny muted" style={{ margin: 0 }}>{t("code.exportHint")}</p>
        </motion.section>
      </div>
    </div>
  );
}
