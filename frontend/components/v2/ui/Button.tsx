'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import styles from './ui.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
  /** 0..1: fills the button as a progress bar (e.g. model initialisation). */
  progress?: number;
  children: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, block = false, progress, className = '', children, type = 'button', ...props }: ButtonProps) {
  const showProgress = progress !== undefined;
  const pct = Math.round(Math.min(Math.max(progress ?? 0, 0), 1) * 100);
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[`button_${variant}`]} ${styles[`button_${size}`]} ${block ? styles.buttonBlock : ''} ${showProgress ? styles.buttonLoading : ''} ${className}`}
      {...(showProgress ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct } : {})}
      {...props}
    >
      {showProgress && <span className={styles.buttonProgress} style={{ width: `${pct}%` }} aria-hidden="true" />}
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 17} />}
      <span>{children}</span>
      {showProgress && <span className={`${styles.buttonPct} num`}>{pct}%</span>}
    </button>
  );
}
