'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import styles from './ui.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  children: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...props }: ButtonProps) {
  const sizeStyle = size === 'sm' ? { minHeight: '30px', padding: '0 10px', fontSize: '9px' } : size === 'lg' ? { minHeight: '48px', padding: '0 18px', fontSize: '11px' } : {};
  return (
    <button className={`${styles.button} ${styles[`button_${variant}`]} ${className}`} style={{ ...sizeStyle, ...props.style }} {...props}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      <span>{children}</span>
    </button>
  );
}
