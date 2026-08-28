interface LogoProps { size?: number; }

export default function Logo({ size = 44 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" aria-label="LAMBDAn logo">
      <rect x="16" y="16" width="268" height="268" rx="38" fill="var(--white)" stroke="var(--black)" strokeWidth="9"/>
      <clipPath id="logo-clip">
        <rect x="24" y="24" width="252" height="252" rx="32"/>
      </clipPath>
      <g clipPath="url(#logo-clip)">
        <text x="150" y="241" textAnchor="middle" fontFamily="Georgia,serif"
              fontSize="280" fontWeight="700" fill="var(--black)">Λ</text>
      </g>
      <text x="212" y="90" fontFamily="Georgia,serif" fontSize="83" fontWeight="700" fill="var(--black)">n</text>
    </svg>
  );
}
