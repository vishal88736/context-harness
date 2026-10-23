import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, Check, Copy, LoaderCircle } from "lucide-react";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M16 28V17M16 21C7 21 4 16 5 7c8-1 13 4 11 14ZM16 17C15 9 20 4 28 4c1 8-3 13-12 13ZM8 10l8 11M24 8l-8 9"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <LoaderCircle size={16} className="spin" />
      <span>{label}</span>
    </span>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          "button,input,textarea,select,a[href],[tabindex]",
        ) ?? []),
      ].filter(
        (element) =>
          !element.matches(":disabled") &&
          element.tabIndex >= 0 &&
          element.getClientRects().length,
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      // An opened workspace stays mounted behind Home. Hidden dialogs must not
      // intercept keyboard navigation on the visible page.
      if (!ref.current?.getClientRects().length) return;
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      ].filter((element) => element.getClientRects().length);
      if (dialogs.at(-1) !== ref.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const all = focusable();
        if (!all.length) return;
        const first = all[0];
        const last = all[all.length - 1];
        if (!ref.current.contains(document.activeElement)) {
          (e.shiftKey ? last : first).focus();
          e.preventDefault();
        } else if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      if (ref.current) {
        ref.current.dataset.copied = "true";
        setTimeout(() => {
          if (ref.current) delete ref.current.dataset.copied;
        }, 1800);
      }
    } catch {
      /* Browser permission can deny clipboard. */
    }
  }
  return (
    <button
      ref={ref}
      className="copy-button"
      aria-label={label}
      title={label}
      onClick={copy}
    >
      <Copy className="copy-default" size={14} />
      <Check className="copy-check" size={14} />
      <span>{label}</span>
    </button>
  );
}
