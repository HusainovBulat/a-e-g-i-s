'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import styles from './ui.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  /** 0..1: fills the button as a progress bar (e.g. model initialisation). */
  progress?: number;
  children: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, progress, className = '', children, ...props }: ButtonProps) {
  const sizeStyle = size === 'sm' ? { minHeight: '30px', padding: '0 10px', fontSize: '9px' } : size === 'lg' ? { minHeight: '48px', padding: '0 18px', fontSize: '11px' } : {};
  const showProgress = progress !== undefined;
  const pct = Math.round(Math.min(Math.max(progress ?? 0, 0), 1) * 100);
  return (
    <button
      className={`${styles.button} ${styles[`button_${variant}`]} ${showProgress ? styles.buttonLoading : ''} ${className}`}
      {...(showProgress ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct } : {})}
      {...props}
      style={{ ...sizeStyle, ...props.style }}
    >
      {showProgress && <span className={styles.buttonProgress} style={{ width: `${pct}%` }} aria-hidden="true" />}
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      <span>{children}</span>
      {showProgress && <span className={styles.buttonPct}>{pct}%</span>}
    </button>
  );
}
