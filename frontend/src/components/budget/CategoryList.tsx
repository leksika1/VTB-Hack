import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { CategorySummary } from '../../domain/budget';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { CategoryIcon } from '../ui/Misc';
import { ProgressBar } from '../ui/ProgressBar';
import { describeCategory, TONE_TEXT } from './categoryStatus';

export function CategoryRow({ category: c }: { category: CategorySummary }) {
  const cfg = CATEGORIES[c.key];
  const { text, tone } = describeCategory(c);
  const barTone = tone === 'danger' ? 'danger' : tone === 'warning' && c.plan > 0 ? 'warning' : 'accent';

  return (
    <li className="py-3.5 first:pt-1 last:pb-1">
      <div className="flex items-center gap-3">
        <CategoryIcon category={c.key} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">{cfg.label}</span>
            <span className="text-sm text-ink-2 tabular whitespace-nowrap">
              {formatCurrency(c.spent)}
              {c.plan > 0 && <> из {formatCurrency(c.plan)}</>}
            </span>
          </div>
          <p className={`text-sm mt-0.5 flex items-center gap-1 ${TONE_TEXT[tone]}`}>
            {tone === 'danger' && <CircleAlert size={14} className="shrink-0" aria-hidden />}
            {tone === 'warning' && <TriangleAlert size={14} className="shrink-0" aria-hidden />}
            <span className={tone === 'neutral' ? '' : 'font-medium'}>{text}</span>
          </p>
        </div>
      </div>
      {c.plan > 0 && (
        <div className="mt-2.5 pl-[3.25rem]">
          <ProgressBar
            size="sm"
            value={c.spent}
            reserved={c.reserved}
            max={c.plan}
            tone={barTone}
            label={`${cfg.label}: ${text}`}
          />
          {c.reserved > 0 && (
            <p className="text-[13px] text-ink-3 mt-1.5">
              Ещё {formatCurrency(c.reserved)} зарезервировано на платежи
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function CategoryList({ categories }: { categories: CategorySummary[] }) {
  return (
    <ul className="divide-y divide-line">
      {categories.map((c) => (
        <CategoryRow key={c.key} category={c} />
      ))}
    </ul>
  );
}
