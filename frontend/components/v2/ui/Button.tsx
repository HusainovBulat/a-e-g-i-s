'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import styles from './ui.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, block = false, className = '', children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[`button_${variant}`]} ${styles[`button_${size}`]} ${block ? styles.buttonBlock : ''} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 17} />}
      <span>{children}</span>
    </button>
  );
}
