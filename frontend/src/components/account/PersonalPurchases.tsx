import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CheckboxField, T } from '@admiral-ds/react-ui';
import {
  confirmPersonalPurchases,
  discardPersonalPurchases,
  errorMessage,
  previewCardPurchases,
  previewPersonalPurchases,
  type PurchaseImport,
} from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useUIStore } from '../../store/uiStore';
import { CATEGORIES } from '../../utils/categories';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, toMonthKey } from '../../utils/date';
import { Button } from '../ui/Button';
import { FormError } from '../ui/Field';
import { Card, SectionHeader } from '../ui/Card';
import { ChoiceChip } from '../ui/ChoiceChip';

const MAX_CSV_BYTES = 1_000_000;

function ImportPreview({ batch, selected, setSelected, split, setSplit, busy, onSave, emptyMessage = 'Новых покупок по карте нет' }: {
  batch: PurchaseImport;
  selected: string[];
  setSelected: (ids: string[]) => void;
  split: boolean;
  setSplit: (split: boolean) => void;
  busy: boolean;
  onSave: () => void;
  emptyMessage?: string;
}) {
  const rows = batch.rows.filter((row) => !row.duplicate && !row.error && !row.expenseId);
  const availableIds = rows.map((row) => row.id);
  const allSelected = availableIds.length > 0 && availableIds.every((id) => selected.includes(id));

  if (!rows.length) return <p className="py-2 text-ink-2">{emptyMessage}</p>;

  return (
    <div className="space-y-4">
      <Button size="sm" variant="secondary" disabled={busy}
        onClick={() => setSelected(allSelected ? [] : availableIds)}>
        {allSelected ? 'Снять выбор' : 'Выбрать все'}
      </Button>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-control bg-surface-muted p-3">
            <CheckboxField disabled={busy} checked={selected.includes(row.id)}
              onChange={(event) => setSelected(event.target.checked
                ? [...selected, row.id]
                : selected.filter((id) => id !== row.id))}>
              <T as="span" font="Body/Body 2 Short" className="wrap-anywhere">
                {row.description || 'Операция по карте'}
              </T>
            </CheckboxField>
            <span className="shrink-0 text-right text-sm font-medium tabular">
              {row.amount !== null && formatCurrency(row.amount)}
            </span>
            <div className="col-start-1 ml-8 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
              {row.date && <time dateTime={row.date}>{formatDateShort(row.date)}</time>}
              <span>{CATEGORIES[row.suggestedCategory].label}</span>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Как учесть покупки</p>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip selected={split} disabled={busy} onClick={() => setSplit(true)}>Поделить с семьёй поровну</ChoiceChip>
          <ChoiceChip selected={!split} disabled={busy} onClick={() => setSplit(false)}>Без деления</ChoiceChip>
        </div>
        <p className="mt-2 text-sm text-ink-2">Личная оплата уменьшит вашу долю к пополнению.</p>
      </div>
      <Button onClick={onSave} disabled={!selected.length} loading={busy}>{`Добавить выбранные (${selected.length})`}</Button>
    </div>
  );
}

export function PersonalCardPurchases() {
  const month = useUIStore((state) => state.monthKey);
  const toast = useUIStore((state) => state.addToast);
  const confirm = useAsyncAction(confirmPersonalPurchases);
  const [batch, setBatch] = useState<PurchaseImport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [split, setSplit] = useState(true);
  const [loading, setLoading] = useState(() => month <= toMonthKey());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let current = true;
    if (month > toMonthKey()) {
      return () => { current = false; };
    }
    previewCardPurchases(month, crypto.randomUUID()).then(
      (value) => { if (current) setBatch(value); },
      (error: unknown) => { if (current) setLoadError(errorMessage(error)); },
    ).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [month, refreshKey]);

  const save = async () => {
    if (!batch || !selected.length) return;
    const result = await confirm.run(batch, selected, split);
    if (!result.ok) return;
    toast(`Расходов добавлено: ${result.value}`);
    setBatch(null);
    setSelected([]);
    setLoadError(null);
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  return (
    <Card className="min-w-0 p-5">
      <SectionHeader title="Мои покупки по карте ВТБ" subtitle="Видны только вам, пока вы их не добавите" />
      {loading && !batch && <p className="py-2 text-ink-2" role="status">Загружаем покупки…</p>}
      {!loading && !batch && !loadError && <p className="py-2 text-ink-2">Новых покупок по карте нет</p>}
      {batch && <ImportPreview batch={batch} selected={selected} setSelected={setSelected}
        split={split} setSplit={setSplit} busy={confirm.pending || loading} onSave={save} />}
      {(loadError || confirm.error) && <FormError>{loadError || confirm.error}</FormError>}
    </Card>
  );
}

export function OtherBankPurchases() {
  const toast = useUIStore((state) => state.addToast);
  const preview = useAsyncAction(previewPersonalPurchases);
  const confirm = useAsyncAction(confirmPersonalPurchases);
  const [batch, setBatch] = useState<PurchaseImport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [split, setSplit] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const busy = preview.pending || confirm.pending;

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || batch) return;
    setFileName(file.name);
    setFileError('');
    if (file.size > MAX_CSV_BYTES) {
      setFileError('Выберите CSV-файл размером до 1 МБ');
      return;
    }
    try {
      const result = await preview.run(file.name, await file.text());
      if (result.ok) setBatch(result.value);
    } catch {
      setFileError('Не удалось прочитать файл');
    }
  };

  const save = async () => {
    if (!batch || !selected.length) return;
    const result = await confirm.run(batch, selected, split);
    if (!result.ok) return;
    setBatch(null);
    setSelected([]);
    setFileName('');
    toast(`Расходов добавлено: ${result.value}`);
  };

  const cancel = () => {
    if (!batch) return;
    void discardPersonalPurchases(batch.id).catch(() => {});
    setBatch(null);
    setSelected([]);
    setFileName('');
  };

  return (
    <Card className="min-w-0 p-5">
      <SectionHeader title="Операции из другого банка"
        subtitle="Загрузите CSV с колонками «Дата», «Сумма», «Описание» и, если есть, MCC. Траты должны быть с минусом." />
      {!batch && (
        <div className="text-sm">
          <input ref={fileInput} type="file" accept=".csv,text/csv" disabled={busy} hidden onChange={readFile} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Выбрать файл</Button>
            <span role="status" className="min-w-0 wrap-anywhere text-ink-2">{fileName || 'Файл не выбран'}</span>
          </div>
        </div>
      )}
      {batch && <ImportPreview batch={batch} selected={selected} setSelected={setSelected}
        split={split} setSplit={setSplit} busy={busy} onSave={save} emptyMessage="В выписке нет новых покупок" />}
      {(fileError || preview.error || confirm.error) && <FormError>{fileError || preview.error || confirm.error}</FormError>}
      {batch && <Button className="mt-3" variant="ghost" disabled={busy} onClick={cancel}>Отменить импорт</Button>}
    </Card>
  );
}
