'use client';

import { motion, useReducedMotion } from 'framer-motion';

export function NumberTicker({ value, suffix = '', className = '' }: { value: string | number; suffix?: string; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.span key={String(value)} className={className} initial={reduceMotion ? false : { opacity: 0.35, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}>{value}{suffix}</motion.span>;
}
