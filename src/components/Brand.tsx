export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 64 64">
        <path d="M10 42c9 0 11-20 22-20s13 20 22 20" fill="none" stroke="#9fd2ff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="32" cy="22" r="5" fill="#fff" />
      </svg>
    </span>
  );
}
