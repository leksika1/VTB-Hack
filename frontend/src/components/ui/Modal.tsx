import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

let activeModalCount = 0;

function lockScroll() {
  if (activeModalCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  activeModalCount++;
}

function unlockScroll() {
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const isLockedRef = useRef(false);

  // Manage open transition
  useEffect(() => {
    if (open) {
      setMounted(true);
      setIsClosing(false);
      if (!isLockedRef.current) {
        lockScroll();
        isLockedRef.current = true;
      }
    } else {
      setMounted((prevMounted) => {
        if (prevMounted) {
          setIsClosing(true);
        }
        return prevMounted;
      });
    }
  }, [open]);

  // Manage exit timer when isClosing is triggered
  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => {
        setMounted(false);
        setIsClosing(false);
        if (isLockedRef.current) {
          unlockScroll();
          isLockedRef.current = false;
        }
      }, 220); // 220ms matches the exit animation keyframe
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  // Cleanup scroll lock on unmount
  useEffect(() => {
    return () => {
      if (isLockedRef.current) {
        unlockScroll();
        isLockedRef.current = false;
      }
    };
  }, []);

  // ESC key listener
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${
        isClosing ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-md ${
          isClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop-in'
        }`}
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidth}
          bg-[var(--color-bg-deep)] border border-[var(--color-border)]
          rounded-t-3xl sm:rounded-3xl p-5 sm:p-6
          max-h-[90vh] overflow-y-auto shadow-2xl pointer-events-auto
          ${isClosing ? 'animate-modal-panel-out' : 'animate-modal-panel-in'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-text-primary)] tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center
              bg-[var(--color-bg-card)] text-[var(--color-text-secondary)]
              hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card-hover)]
              active:scale-90 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
