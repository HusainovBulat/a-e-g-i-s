'use client';

import type { ReactNode } from 'react';
import type { Tone } from '../../../lib/status';
import styles from './ui.module.css';

interface CardProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
  bodyClassName?: string;
}

export function Card({ children, title, subtitle, action, tone, className = '', bodyClassName = '' }: CardProps) {
  return (
    <section className={`${styles.card} ${tone ? styles[`card_${tone}`] : ''} ${className}`}>
      {(title || action) && (
        <header className={styles.cardHeader}>
          <div className={styles.cardHeading}>
            {title && <h2 className={styles.cardTitle}>{title}</h2>}
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
          {action && <div className={styles.cardAction}>{action}</div>}
        </header>
      )}
      <div className={`${styles.cardBody} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
