'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import styles from './ui.module.css';

export interface SegmentOption<T extends string> { value: T; label: string; }

export function Segmented<T extends string>({ options, value, onChange, label }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; label?: string }) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map(option => <button key={option.value} type="button" className={`${styles.segmentedOption} ${value === option.value ? styles.segmentedActive : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  );
}

export function Slider({ label, value, min = 0, max = 10, step = 1, unit = '', onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <label className={styles.slider} htmlFor={id}>
      <span className={styles.sliderMeta}><span>{label}</span><strong>{value}{unit}</strong></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
      <span className={styles.sliderTicks}><span>{min}{unit}</span><span>{max}{unit}</span></span>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={styles.toggleRow} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span>{label}</span><i className={`${styles.toggleTrack} ${checked ? styles.toggleOn : ''}`}><b /></i>
    </button>
  );
}

export function Modal({ open, onClose, title, eyebrow, children, className = '' }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={styles.modalScrim} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`${styles.modal} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.modalHeader}>
          <div>{eyebrow && <span className={styles.panelEyebrow}>{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div>
          <button type="button" className={styles.iconButton} aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className={styles.modalBody}>{children}</div>
      </section>
    </div>
  );
}
