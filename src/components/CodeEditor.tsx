import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, RangeSetBuilder } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--ink)" },
  ".cm-content": { fontFamily: "var(--mono)", caretColor: "var(--primary)" },
  ".cm-cursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 22%, transparent) !important",
  },
  ".cm-gutters": { fontFamily: "var(--mono)" },
  ".cm-tooltip": { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "var(--primary-soft)", color: "var(--ink)" },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword], color: "var(--c-gyro)", fontWeight: "500" },
  { tag: [tags.function(tags.variableName), tags.function(tags.definition(tags.variableName))], color: "var(--primary)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--c-pid)" },
  { tag: [tags.string], color: "#4d7c0f" },
  { tag: [tags.comment, tags.lineComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [tags.className], color: "#be185d" },
  { tag: [tags.propertyName], color: "var(--ink-2)" },
]);

function errorLineExt(line: number | null | undefined) {
  const deco = Decoration.line({ class: "cm-error-line" });
  return StateField.define<DecorationSet>({
    create(state) {
      const b = new RangeSetBuilder<Decoration>();
      if (line && line >= 1 && line <= state.doc.lines) {
        const l = state.doc.line(line);
        b.add(l.from, l.from, deco);
      }
      return b.finish();
    },
    update(v, tr) {
      return tr.docChanged ? Decoration.none : v;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

interface Props {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  height?: string;
  errorLine?: number | null;
  label?: string;
}

export default function CodeEditor({ value, onChange, readOnly, height = "420px", errorLine, label }: Props) {
  const extensions = useMemo(
    () => [python(), theme, syntaxHighlighting(highlight), EditorView.lineWrapping, errorLineExt(errorLine), EditorView.contentAttributes.of({ "aria-label": label ?? "Python code" })],
    [errorLine, label],
  );
  return (
    <div className="cm-wrap">
      <CodeMirror
        value={value}
        height={height}
        theme="none"
        readOnly={readOnly}
        extensions={extensions}
        onChange={(v) => onChange?.(v)}
        basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, indentOnInput: true, tabSize: 4 }}
      />
    </div>
  );
}
