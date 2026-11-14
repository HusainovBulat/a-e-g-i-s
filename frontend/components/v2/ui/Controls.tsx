'use client';

import { useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './icons';
import styles from './ui.module.css';

export interface SegmentOption<T extends string> { value: T; label: ReactNode; }

export function Segmented<T extends string>({ options, value, onChange, label, block = false }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; label?: string; block?: boolean }) {
  return (
    <div className={`${styles.segmented} ${block ? styles.segmentedBlock : ''}`} role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segment} ${value === option.value ? styles.segmentActive : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min = 0, max = 10, step = 1, unit = '', hint, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; hint?: ReactNode; onChange: (value: number) => void }) {
  const id = useId();
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className={styles.slider}>
      <div className={styles.sliderHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="num">{value}{unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={event => onChange(Number(event.target.value))}
      />
      {hint && <p className={styles.sliderHint}>{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={styles.toggle} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <i className={`${styles.toggleTrack} ${checked ? styles.toggleOn : ''}`}><b /></i>
    </button>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, subtitle, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className={styles.scrim} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`${styles.modal} ${wide ? styles.modalWide : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.overlayHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className={styles.iconButton} aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className={styles.overlayBody}>{children}</div>
      </section>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const titleId = useId();
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className={`${styles.scrim} ${styles.scrimDrawer}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.overlayHeader}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={styles.iconButton} aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className={styles.overlayBody}>{children}</div>
      </aside>
    </div>
  );
}
