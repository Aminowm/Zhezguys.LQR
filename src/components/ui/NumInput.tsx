import { useEffect, useRef, useState, InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | undefined;
  onCommit(v: number | undefined): void;
  /** values outside (min..max) are not committed while typing; on blur they are clamped */
  min?: number;
  max?: number;
  digits?: number;
  allowEmpty?: boolean;
};

const fmt = (v: number | undefined, digits: number) => (v === undefined || !Number.isFinite(v) ? "" : String(+v.toFixed(digits)));

/** A number field you can clear and retype: keeps its own text while focused. */
export default function NumInput({ value, onCommit, min, max, digits = 2, allowEmpty, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(fmt(value, digits));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value, digits));
  }, [value, digits]);
  const parse = (s: string) => {
    const v = Number(s.replace(",", "."));
    return s.trim() === "" || !Number.isFinite(v) ? undefined : v;
  };
  const inRange = (v: number) => (min === undefined || v >= min) && (max === undefined || v <= max);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const s = e.target.value;
        if (!/^-?[0-9]*[.,]?[0-9]*$/.test(s)) return;
        setText(s);
        const v = parse(s);
        if (v === undefined) {
          if (allowEmpty) onCommit(undefined);
        } else if (inRange(v)) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        rest.onKeyDown?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        const v = parse(text);
        if (v === undefined) {
          if (allowEmpty) onCommit(undefined);
          setText(allowEmpty ? "" : fmt(value, digits));
        } else {
          const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
          if (c !== value) onCommit(c);
          setText(fmt(c, digits));
        }
        onBlur?.(e);
      }}
    />
  );
}
