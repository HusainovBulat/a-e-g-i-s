'use client';

import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface PanelProps {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ children, title, eyebrow, action, className = '', bodyClassName = '' }: PanelProps) {
  return (
    <section className={`${styles.panel} ${className}`}>
      {(title || eyebrow || action) && (
        <header className={styles.panelHeader}>
          <div>
            {eyebrow && <span className={styles.panelEyebrow}>{eyebrow}</span>}
            {title && <h2 className={styles.panelTitle}>{title}</h2>}
          </div>
          {action && <div className={styles.panelAction}>{action}</div>}
        </header>
      )}
      <div className={`${styles.panelBody} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
