import { ProgressPage } from '@admiral-ds/react-ui';

interface ProgressBarProps {
  /** Actually spent */
  value: number;
  /** Reserved for upcoming payments, drawn as a hatched part after the spent part */
  reserved?: number;
  max: number;
  tone?: 'accent' | 'warning' | 'danger' | 'inverse';
  label: string;
  size?: 'sm' | 'md';
}

const FILL: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  accent: 'var(--accent)',
  warning: 'var(--warning-bar)',
  danger: 'var(--danger)',
  inverse: '#ffffff',
};

export function ProgressBar({ value, reserved = 0, max, tone = 'accent', label, size = 'md' }: ProgressBarProps) {
  const total = Math.max(max, value + reserved, 1);
  const spentPct = (Math.max(value, 0) / total) * 100;
  const reservedPct = (Math.max(reserved, 0) / total) * 100;
  const limitPct = max > 0 ? (max / total) * 100 : 100;
  const inverse = tone === 'inverse';
  const fill = FILL[tone];
  const progressValue = Math.round(Math.min(Math.max(max, 0), Math.max(value + reserved, 0)));
  const progressProps = {
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(Math.max(0, max)),
    'aria-valuenow': progressValue,
  };

  if (!reserved && value <= max && (tone === 'accent' || tone === 'danger')) {
    return <ProgressPage {...progressProps} percent={spentPct} appearance={tone === 'danger' ? 'error' : 'primary'} />;
  }

  return (
    <div
      {...progressProps}
      className={`relative w-full ${size === 'sm' ? 'h-2' : 'h-3'} rounded-full overflow-hidden
        ${inverse ? 'bg-white/20' : 'bg-track'}`}
    >
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${spentPct}%`, background: fill }} />
      {reservedPct > 0 && (
        <div
          className="absolute inset-y-0 transition-[left,width] duration-500"
          style={{
            left: `${spentPct}%`,
            width: `${reservedPct}%`,
            background: `repeating-linear-gradient(135deg, ${fill} 0 3px, transparent 3px 6px)`,
            opacity: inverse ? 0.7 : 0.55,
          }}
        />
      )}
      {limitPct < 100 && (
        <div className={`absolute inset-y-0 w-0.5 ${inverse ? 'bg-white' : 'bg-ink'}`} style={{ left: `calc(${limitPct}% - 1px)` }} />
      )}
    </div>
  );
}
