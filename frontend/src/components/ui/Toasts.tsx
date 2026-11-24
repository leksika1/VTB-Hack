import { useUIStore } from '../../store/uiStore';
import {
  StyledNotificationItem,
  NotificationItemContent,
  NotificationItemButtonPanel,
  Button as AdmiralButton,
} from '@admiral-ds/react-ui';

export function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div
      aria-live="polite"
      className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6
        flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${toast.leaving ? 'animate-toast-out' : 'animate-sheet-in'} pointer-events-auto`}
        >
          <StyledNotificationItem
            status={toast.type}
            isBorderHidden
            displayStatusIcon
            isClosable
            onClose={() => removeToast(toast.id)}
          >
            <NotificationItemContent>{toast.message}</NotificationItemContent>
            {toast.action && (
              <NotificationItemButtonPanel>
                <AdmiralButton
                  appearance="ghost"
                  dimension="s"
                  onClick={() => {
                    toast.action?.onClick();
                    removeToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </AdmiralButton>
              </NotificationItemButtonPanel>
            )}
          </StyledNotificationItem>
        </div>
      ))}
    </div>
  );
}
