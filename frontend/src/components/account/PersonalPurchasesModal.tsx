import { useState, type ChangeEvent } from 'react';
import { CheckboxField, T } from '@admiral-ds/react-ui';
import { confirmPersonalPurchases, discardPersonalPurchases, previewPersonalPurchases, type PurchaseImport } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, todayISO } from '../../utils/date';
import { Button } from '../ui/Button';
import { FormError } from '../ui/Field';
import { Modal } from '../ui/Modal';

const MAX_CSV_BYTES = 1_000_000;

export function PersonalPurchasesModal() {
  const close = useUIStore((s) => s.closeModal);
  const toast = useUIStore((s) => s.addToast);
  const demo = useFamilyStore((s) => s.family?.isDemo);
  const preview = useAsyncAction(previewPersonalPurchases);
  const confirm = useAsyncAction(confirmPersonalPurchases);
  const [batch, setBatch] = useState<PurchaseImport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [split, setSplit] = useState(true);
  const [fileError, setFileError] = useState('');
  const busy = preview.pending || confirm.pending;

  async function load(filename: string, content: string) {
    setFileError('');
    const res = await preview.run(filename, content);
    if (res.ok) {
      setBatch(res.value);
      setSelected([]);
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || batch) return;
    if (file.size > MAX_CSV_BYTES) {
      setFileError('Выберите CSV-файл размером до 1 МБ');
      return;
    }
    try {
      await load(file.name, await file.text());
    } catch {
      setFileError('Не удалось прочитать файл');
    }
  }

  function showDemoCard() {
    const date = todayISO();
    void load('Демо-карта.csv', `Дата;Сумма;Описание\n${date};-2340;Продукты для дома\n${date};-1640;Детские книги\n${date};-390;Кофейня\n`);
  }

  async function save() {
    if (!batch || !selected.length) return;
    const res = await confirm.run(batch, selected, split);
    if (res.ok) {
      close();
      toast(`Расходов добавлено: ${res.value}`);
    }
  }

  return (
    <Modal title="Добавить из личных покупок" onClose={() => {
      if (busy) return;
      if (batch) void discardPersonalPurchases(batch.id).catch(() => {});
      close();
    }}
      description="Выписку видите только вы. В семейный бюджет попадут выбранные покупки."
      footer={batch && <Button onClick={save} disabled={!selected.length} loading={confirm.pending} fullWidth>Добавить выбранные</Button>}>
      <div className="space-y-4">
        {!batch && (
          <>
            {demo && <Button variant="secondary" onClick={showDemoCard} loading={preview.pending}>Показать покупки демо-карты</Button>}
            <label className="block text-sm font-medium">
              Загрузить выписку CSV
              <input type="file" accept=".csv,text/csv" disabled={busy}
                className="mt-2 block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent-ink"
                onChange={readFile} />
            </label>
          </>
        )}
        {batch && (
          <>
            <ul className="space-y-2">
              {batch.rows.map((row) => (
                <li key={row.id} className="flex min-w-0 items-start justify-between gap-3 rounded-control bg-surface-muted p-3">
                  <CheckboxField disabled={busy || row.duplicate || !!row.error} checked={selected.includes(row.id)}
                    onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, row.id] : previous.filter((id) => id !== row.id))}>
                    <T as="span" font="Body/Body 2 Short" className="wrap-anywhere">{row.description || 'Операция по карте'}</T>
                  </CheckboxField>
                  <span className="shrink-0 text-right text-sm">
                    {row.amount !== null && formatCurrency(row.amount)}
                    <span className="block text-xs text-ink-2">{row.error ?? (row.duplicate ? 'Уже добавлено' : row.date ? formatDateShort(row.date) : '')}</span>
                  </span>
                </li>
              ))}
            </ul>
            <CheckboxField checked={split} disabled={busy} onChange={(event) => setSplit(event.target.checked)}
              extraText="Сумма учитывается как личная оплата и уменьшает вашу долю к пополнению.">
              Разделить покупки поровну
            </CheckboxField>
          </>
        )}
        {(fileError || preview.error || confirm.error) && <FormError>{fileError || preview.error || confirm.error}</FormError>}
      </div>
    </Modal>
  );
}
