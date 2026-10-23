import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { usePresenceClosing } from './presenceContext';

interface ModalProps {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer with the main actions, always reachable above the keyboard */
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * Accessible dialog: rendered only while open (wrap it in <Presence> to animate the exit),
 * traps focus, closes on Esc, returns focus to the element that opened it.
 * Bottom sheet on phones, centered dialog on wider screens.
 * Portalled to <body>: an animated ancestor (the tab fade-in) would otherwise clip the fixed backdrop to itself.
 */
export function Modal({ onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = usePresenceClosing();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    // Focus the marked field if any, otherwise the dialog itself (does not pop the keyboard on phones)
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (first ?? panel)?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 ${closing ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-[var(--overlay)] ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'} bg-surface text-ink
          rounded-t-[1.5rem] sm:rounded-[1.5rem] shadow-[var(--shadow-pop)] ${closing ? 'animate-sheet-out' : 'animate-sheet-in'}
          max-h-[92dvh] flex flex-col focus:outline-none`}
      >
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-3">
          <div className="flex-1 min-w-0 pt-1.5">
            <h2 id={titleId} className="text-xl font-semibold leading-tight break-words">
              {title}
            </h2>
            {description && (
              <div id={descId} className="text-sm text-ink-2 mt-1">
                {description}
              </div>
            )}
          </div>
          <IconButton label="Закрыть" onClick={onClose} className="-mr-2 -mt-1">
            <X size={20} />
          </IconButton>
        </div>
        <div className="px-5 sm:px-6 pb-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-line bg-surface rounded-b-[1.5rem]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
