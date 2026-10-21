import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const ICON_TONE = { success: 'text-[#5fd99a]', error: 'text-[#ff8a96]', info: 'text-[#8ab3ff]' };

export function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div
      aria-live="polite"
      className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6
        flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`${toast.leaving ? 'animate-toast-out' : 'animate-sheet-in'} pointer-events-auto flex items-center gap-3 pl-4 pr-1.5 py-1.5 min-h-12 rounded-2xl
              bg-[#14243d] text-white shadow-[var(--shadow-pop)]`}
          >
            <Icon size={20} className={`shrink-0 ${ICON_TONE[toast.type]}`} aria-hidden />
            <span className="text-sm flex-1 py-1.5">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  removeToast(toast.id);
                }}
                className="shrink-0 px-3 h-9 rounded-xl text-sm font-semibold text-[#8ab3ff] hover:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Закрыть уведомление"
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
