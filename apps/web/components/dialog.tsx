'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  children,
  onClose,
  drawer = false,
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  eyebrow?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const input = dialog?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([type="hidden"]), textarea, select',
    );
    input?.focus();
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? 'dialog drawer' : 'dialog'}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <span className="eyebrow">
            {eyebrow ?? (drawer ? 'THE DETAILS' : 'QUICK CAPTURE')}
          </span>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
