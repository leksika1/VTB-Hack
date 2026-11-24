import { useId, type ReactNode } from 'react';
import { useMediaQuery } from '../../utils/theme';
import {
  Modal as AdmiralModal,
  ModalTitle,
  ModalContent,
  ModalButtonPanel,
} from '@admiral-ds/react-ui';

export interface ModalProps {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer with the main actions, always reachable above the keyboard */
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Accessible dialog using Admiral DS Modal component.
 * Includes focus trapping, Escape listener, backdrop, close button, and responsive design.
 */
export function Modal({ onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const mobile = useMediaQuery('(max-width: 639px)');
  return (
    <AdmiralModal
      mobile={mobile}
      aria-labelledby={titleId}
      dimension={size === 'lg' ? 'l' : 'm'}
      onClose={onClose}
      closeOnEscapeKeyDown
      closeOnOutsideClick
      displayCloseIcon
    >
      <ModalTitle id={titleId}>{title}</ModalTitle>
      {description && (
        <div className="px-6 pb-2 -mt-1 text-sm text-ink-2">
          {description}
        </div>
      )}
      <ModalContent>
        <div className="py-1">
          {children}
        </div>
      </ModalContent>
      {footer && <ModalButtonPanel>{footer}</ModalButtonPanel>}
    </AdmiralModal>
  );
}
