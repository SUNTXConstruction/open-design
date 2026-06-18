// A lightweight modal wrapper around BrandReferencePicker.
//
// Unlike NewBrandModal (which owns its own URL field + extraction kickoff),
// this modal is a pure picker: it surfaces the full searchable brand gallery
// (hundreds of references) and calls `onPick` with the chosen brand, then
// closes. Hosts decide what picking means — e.g. the Design System create flow
// drops the brand's domain into its source-URL list rather than extracting
// immediately.

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BrandReference } from '../runtime/brand-references';
import { BrandReferencePicker } from './BrandReferencePicker';
import { Icon } from './Icon';
import styles from './BrandPickerModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen brand; the modal closes itself afterwards. */
  onPick: (brand: BrandReference) => void;
  title?: string;
  subtitle?: string;
}

export function BrandPickerModal({ open, onClose, onPick, title, subtitle }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handlePick = useCallback(
    (brand: BrandReference) => {
      onPick(brand);
      onClose();
    },
    [onPick, onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Start from a brand'}
        data-testid="brand-picker-modal"
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
            data-testid="brand-picker-modal-close"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className={styles.pickerWrap}>
          <BrandReferencePicker variant="compact" fillHeight onPick={handlePick} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
