interface LogoProps { size?: number; }

export default function Logo({ size = 38 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" aria-label="LAMBDAn logo">
      <rect x="50" y="50" width="200" height="200" rx="32" fill="#fff" stroke="#000" strokeWidth="7"/>
      <clipPath id="logo-clip">
        <rect x="57" y="57" width="186" height="186" rx="26"/>
      </clipPath>
      <g clipPath="url(#logo-clip)">
        <text x="150" y="222" textAnchor="middle" fontFamily="Georgia,serif"
              fontSize="210" fontWeight="700" fill="#000">Λ</text>
      </g>
      <text x="196" y="105" fontFamily="Georgia,serif" fontSize="62" fontWeight="700" fill="#000">n</text>
    </svg>
  );
}
