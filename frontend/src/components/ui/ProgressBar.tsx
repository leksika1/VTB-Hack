interface ProgressBarProps {
  value: number; // 0–100+
  color?: string;
  overBudget?: boolean;
  height?: string;
  animate?: boolean;
}

export function ProgressBar({
  value,
  color = 'var(--color-lime)',
  overBudget = false,
  height = 'h-2.5',
  animate = true,
}: ProgressBarProps) {
  const clampedWidth = Math.min(value, 100);
  const barColor = overBudget ? 'var(--color-danger)' : color;

  return (
    <div className={`w-full ${height} rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-700 ease-out ${animate ? 'animate-progress-fill' : ''}`}
        style={{
          width: `${clampedWidth}%`,
          background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
          boxShadow: overBudget
            ? `0 0 12px rgba(255,83,83,0.4)`
            : `0 0 12px ${color}33`,
        }}
      />
    </div>
  );
}
