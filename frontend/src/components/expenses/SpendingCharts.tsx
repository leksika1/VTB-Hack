import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartColumn, ChartPie } from 'lucide-react';
import type { Expense, ExpenseCategory } from '../../types';
import { ALL_CATEGORIES, CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { plural } from '../../utils/date';
import { Card } from '../ui/Card';

type View = 'bar' | 'pie';

interface Slice {
  key: ExpenseCategory;
  amount: number;
  count: number;
  share: number;
}

const VIEW_STORAGE_KEY = 'fb-operations-chart-view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'pie' ? 'pie' : 'bar';
  } catch {
    return 'bar';
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* storage may be unavailable — the choice just won't be remembered */
  }
}

/** 38 000 → «38 тыс.»; used only for axis ticks, values are always shown in full */
function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${Math.round(amount / 100_000) / 10} млн`;
  if (amount >= 1000) return `${Math.round(amount / 1000)} тыс.`;
  return String(Math.round(amount));
}

/** Round the axis maximum up to 1, 2, 2.5 or 5 × 10ⁿ */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * exp >= value) ?? 10;
  return step * exp;
}

/** Spending of the shown operations by category: column chart or donut, switchable */
interface SpendingChartsProps {
  /** Operations after search and author filters, but before the category filter — so every category stays visible */
  expenses: Expense[];
  /** Categories selected as a filter for the list */
  selected: ExpenseCategory[];
  /** Click on a column, segment or legend row toggles that category in the list filter */
  onToggle: (key: ExpenseCategory) => void;
}

/** Spending by category, column chart or donut. Clicking a category filters the operations list. */
export function SpendingCharts({ expenses, selected, onToggle }: SpendingChartsProps) {
  const [view, setView] = useState<View>(readView);
  const [active, setActive] = useState<ExpenseCategory | null>(null);

  const { slices, total } = useMemo(() => {
    const sum = expenses.reduce((s, e) => s + e.amount, 0);
    const list: Slice[] = ALL_CATEGORIES.map((key) => {
      const items = expenses.filter((e) => e.category === key);
      const amount = items.reduce((s, e) => s + e.amount, 0);
      return { key, amount, count: items.length, share: sum > 0 ? amount / sum : 0 };
    }).filter((s) => s.amount > 0);
    return { slices: list, total: sum };
  }, [expenses]);

  if (total === 0) return null;

  const changeView = (next: View) => {
    setView(next);
    setActive(null);
    saveView(next);
  };

  return (
    <Card tone="default" className="p-4 sm:p-5 mt-5 animate-month-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-ink leading-tight">Расходы по категориям</h2>
          <p className="text-sm text-ink-2 mt-0.5">
            <span className="tabular">{formatCurrency(total)}</span>, {expenses.length}{' '}
            {plural(expenses.length, 'операция', 'операции', 'операций')}
          </p>
        </div>
        <ViewSwitcher view={view} onChange={changeView} />
      </div>

      <div key={view} className="animate-fade-in">
        {view === 'bar' ? (
          <ColumnChart slices={slices} active={active} onActive={setActive} selected={selected} onToggle={onToggle} />
        ) : (
          <DonutChart slices={slices} total={total} active={active} onActive={setActive} selected={selected} onToggle={onToggle} />
        )}
      </div>
      <p className="text-[13px] text-ink-3 mt-3">
        {selected.length > 0
          ? 'Список ниже показывает выбранные категории. Нажмите ещё раз, чтобы снять выбор.'
          : 'Нажмите на категорию, чтобы показать только её операции.'}
      </p>
    </Card>
  );
}

const VIEWS: { value: View; label: string; icon: React.ReactNode }[] = [
  { value: 'bar', label: 'Столбцы', icon: <ChartColumn size={17} /> },
  { value: 'pie', label: 'Круг', icon: <ChartPie size={17} /> },
];

/** Segmented control with a brand-gradient pill that slides and resizes under the selected option */
function ViewSwitcher({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const refs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // No transition on the very first placement, otherwise the pill slides in from the edge
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const el = refs.current[view];
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [view]);

  useEffect(() => {
    if (!pill || animated) return;
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [pill, animated]);

  return (
    <div role="radiogroup" aria-label="Вид графика" className="relative inline-flex p-1 rounded-control bg-surface-sunken">
      {pill && (
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 rounded-[10px] brand-fill shadow-[var(--shadow-card)] ${animated ? 'transition-[left,width] duration-300 ease-[var(--ease-in-out)]' : ''
            }`}
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {VIEWS.map((v) => {
        const active = v.value === view;
        return (
          <button
            key={v.value}
            ref={(el) => {
              refs.current[v.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v.value)}
            className={`relative z-10 h-9 px-3 rounded-[10px] inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-300
              ${active ? 'text-white' : 'text-ink-2 hover:text-ink'}`}
          >
            {v.icon}
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

interface ChartProps {
  slices: Slice[];
  active: ExpenseCategory | null;
  onActive: (key: ExpenseCategory | null) => void;
  selected: ExpenseCategory[];
  onToggle: (key: ExpenseCategory) => void;
}

/** Hover wins over the selection; otherwise categories outside the selection are dimmed */
function isDimmed(key: ExpenseCategory, active: ExpenseCategory | null, selected: ExpenseCategory[]): boolean {
  if (active) return active !== key;
  return selected.length > 0 && !selected.includes(key);
}

function onActivateKey(e: React.KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

/* ── Columns ── */

function ColumnChart({ slices, active, onActive, selected, onToggle }: ChartProps) {
  // Largest first reads easiest; colour still follows the category, not the rank
  const sorted = [...slices].sort((a, b) => b.amount - a.amount);
  const max = niceMax(sorted[0]?.amount ?? 0);
  const ticks = [max, max / 2, 0];

  return (
    <div className="flex gap-2 sm:gap-3">
      {/* Y axis */}
      <div className="relative w-12 shrink-0 h-52 text-[11px] text-ink-3 tabular" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
            {formatCompact(t)}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-52">
          {/* Recessive gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 ${t === 0 ? 'border-t border-line-strong' : 'border-t border-dashed border-line'}`}
              style={{ top: `${(1 - t / max) * 100}%` }}
              aria-hidden
            />
          ))}

          <ul className="absolute inset-0 flex items-end justify-center gap-3 sm:gap-4 px-2" aria-label="Расходы по категориям">
            {sorted.map((s) => {
              const cfg = CATEGORIES[s.key];
              const dimmed = isDimmed(s.key, active, selected);
              const isActive = active === s.key;
              const isSelected = selected.includes(s.key);
              return (
                <li
                  key={s.key}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${cfg.label}: ${formatCurrency(s.amount)}, ${Math.round(s.share * 100)}%`}
                  onClick={() => onToggle(s.key)}
                  onKeyDown={(e) => onActivateKey(e, () => onToggle(s.key))}
                  onMouseEnter={() => onActive(s.key)}
                  onMouseLeave={() => onActive(null)}
                  onFocus={() => onActive(s.key)}
                  onBlur={() => onActive(null)}
                  className="relative h-full flex-1 max-w-24 flex flex-col justify-end items-center cursor-pointer focus-visible:outline-none group"
                >
                  {isActive && <Tooltip slice={s} />}
                  <span className={`text-xs font-semibold text-ink tabular mb-1 whitespace-nowrap transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
                    {formatCompact(s.amount)}
                  </span>
                  <span
                    className={`w-full rounded-t-xl transition-[opacity,outline-color] duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus)]
                      outline-2 outline-offset-2 ${isSelected ? 'outline-[var(--ink)]' : 'outline-transparent'} ${dimmed ? 'opacity-35' : ''}`}
                    style={{ height: `${(s.amount / max) * 100}%`, background: cfg.color, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.45)' }}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {/* Category labels under the baseline */}
        <div className="flex justify-center gap-3 sm:gap-4 px-2 mt-2" aria-hidden>
          {sorted.map((s) => (
            <span
              key={s.key}
              className={`flex-1 max-w-24 text-center text-xs truncate transition-opacity
                ${selected.includes(s.key) ? 'text-ink font-semibold' : 'text-ink-2'} ${isDimmed(s.key, active, selected) ? 'opacity-50' : ''}`}
            >
              {CATEGORIES[s.key].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tooltip({ slice }: { slice: Slice }) {
  const cfg = CATEGORIES[slice.key];
  return (
    <span
      role="tooltip"
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-xl bg-[#14243d] text-white px-3 py-2 text-[13px] shadow-[var(--shadow-pop)] animate-fade-in pointer-events-none"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: cfg.color }} aria-hidden />
        {cfg.label}
      </span>
      <span className="block tabular mt-0.5">{formatCurrency(slice.amount)}</span>
      <span className="block text-white/70">
        {Math.round(slice.share * 100)}%, {slice.count} {plural(slice.count, 'операция', 'операции', 'операций')}
      </span>
    </span>
  );
}

/* ── Donut ── */

const SIZE = 220;
const RADIUS = 84;
const STROKE = 30;
const GAP = 3; // surface gap between segments, px along the arc
const CIRC = 2 * Math.PI * RADIUS;

function DonutChart({ slices, total, active, onActive, selected, onToggle }: ChartProps & { total: number }) {
  // Segments grow from zero after mount
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Fixed category order around the circle: neighbouring colours are the validated adjacent pairs
  const segments = slices.map((s, i) => ({
    slice: s,
    start: slices.slice(0, i).reduce((sum, prev) => sum + prev.share * CIRC, 0),
    length: s.share * CIRC,
  }));
  const gap = slices.length > 1 ? GAP : 0;
  const focus = active ? slices.find((s) => s.key === active) : null;

  return (
    <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)] items-center">
      <div className="relative mx-auto w-55 h-55">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90" role="img" aria-label="Доли категорий в расходах">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--track)" strokeWidth={STROKE} />
          {segments.map(({ slice, start, length }) => {
            const visible = Math.max(length - gap, 0.5);
            const isActive = active === slice.key;
            const isSelected = selected.includes(slice.key);
            return (
              <circle
                key={slice.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={CATEGORIES[slice.key].color}
                strokeWidth={isActive || isSelected ? STROKE + 8 : STROKE}
                strokeDasharray={drawn ? `${visible} ${CIRC - visible}` : `0 ${CIRC}`}
                strokeDashoffset={-(start + gap / 2)}
                opacity={isDimmed(slice.key, active, selected) ? 0.35 : 1}
                className="cursor-pointer"
                style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s, opacity 0.2s' }}
                onMouseEnter={() => onActive(slice.key)}
                onMouseLeave={() => onActive(null)}
                onClick={() => onToggle(slice.key)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-10">
          <span className="text-[13px] text-ink-2 truncate max-w-full">{focus ? CATEGORIES[focus.key].label : 'Всего'}</span>
          <span className="text-xl font-bold text-ink tabular leading-tight">{formatCurrency(focus ? focus.amount : total)}</span>
          {focus && <span className="text-[13px] text-ink-3 tabular">{Math.round(focus.share * 100)}%</span>}
        </div>
      </div>

      {/* Legend doubles as the data table: label, count, amount, share */}
      <ul className="divide-y divide-line">
        {slices.map((s) => {
          const cfg = CATEGORIES[s.key];
          const isActive = active === s.key;
          const isSelected = selected.includes(s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(s.key)}
                onMouseEnter={() => onActive(s.key)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(s.key)}
                onBlur={() => onActive(null)}
                className={`w-[calc(100%+1rem)] flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left transition-colors ${isActive || isSelected ? 'bg-surface-muted' : ''} ${isDimmed(s.key, active, selected) ? 'opacity-50' : ''}`}
              >
                <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ background: cfg.color }} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className={`block text-ink truncate ${isSelected ? 'font-semibold' : ''}`}>{cfg.label}</span>
                  <span className="block text-[13px] text-ink-3">
                    {s.count} {plural(s.count, 'операция', 'операции', 'операций')}
                  </span>
                </span>
                <span className="text-ink tabular whitespace-nowrap">{formatCurrency(s.amount)}</span>
                <span className="text-ink-3 tabular w-10 text-right">{Math.round(s.share * 100)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
