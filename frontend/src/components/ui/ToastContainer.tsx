import { useUIStore } from '../../store/uiStore';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colorMap = {
  success: 'border-[var(--color-success)] text-[var(--color-success)]',
  error: 'border-[var(--color-danger)] text-[var(--color-danger)]',
  info: 'border-[var(--color-info)] text-[var(--color-info)]',
};

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90vw] max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={`animate-toast-in glass-card flex items-center gap-3 px-4 py-3 border ${colorMap[toast.type]} pointer-events-auto shadow-lg`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="text-sm text-[var(--color-text-primary)] flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
