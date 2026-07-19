'use client';

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

// Module-level LIFO stack of open modal tokens, shared across every `Modal`
// instance mounted in the app. Escape must only close the top-most modal —
// without this, stacking two `Modal`s (e.g. a "Nueva marca" quick-create
// opened from inside a "Nuevo vehículo" quick-create) double-closes: a
// single Escape keypress fires every mounted modal's `document` listener at
// once, since none of them call `stopPropagation`.
let openModalStack: string[] = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-md',
}: ModalProps) {
  const token = useId();

  useEffect(() => {
    if (!open) return;

    openModalStack.push(token);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Only the top-most modal answers Escape; a modal stacked above this
      // one (opened later) owns the keypress instead.
      const isTopMost = openModalStack[openModalStack.length - 1] === token;
      if (isTopMost) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    // Freeze the page behind the modal — restore whatever value was set
    // before we opened, rather than assuming it was always empty.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Remove by value, not by assuming this token is last — a lower layer
      // can close out of order, and the stack must stay consistent for
      // whichever modal(s) remain open.
      openModalStack = openModalStack.filter((t) => t !== token);
    };
  }, [open, onClose, token]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-stone-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-lg`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-stone-900">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-stone-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
