'use client';

import type { ReactNode, SVGProps } from 'react';

export type IconName = 'arrowUpRight' | 'bell' | 'check' | 'chevronDown' | 'close' | 'globe' | 'heart' | 'menu' | 'moon' | 'phone' | 'radio' | 'shield' | 'signal' | 'spark' | 'user' | 'warning' | 'wave' | 'activity' | 'clock' | 'plus' | 'scan' | 'github';

const paths: Record<IconName, ReactNode> = {
  arrowUpRight: <><path d="M7 17 17 7M7 7h10v10" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  heart: <path d="M20.8 8.7c0 5.2-8.8 11-8.8 11S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z" />,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="0" /><path d="M10 18.5h4" /></>,
  radio: <><path d="m5 8 14-4M7 12a7 7 0 0 1 10 0M9.5 15a3.5 3.5 0 0 1 5 0M12 19h.01" /><circle cx="12" cy="19" r="1" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  signal: <><path d="M3 20h2v-3H3zM8 20h2v-7H8zM13 20h2V9h-2zM18 20h2V4h-2z" /></>,
  spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  warning: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
  wave: <path d="M2 12h3l3-8 5 16 3-8h6" />,
  activity: <path d="M3 12h4l2-7 4 14 3-9 2 2h3" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  scan: <><path d="M4 8V4h4m8 0h4v4M20 16v4h-4M8 20H4v-4" /><path d="M4 12h16" /></>,
  github: <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />,
};

export function Icon({ name, size = 18, strokeWidth = 1.7, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" {...props}>
      {paths[name]}
    </svg>
  );
}
