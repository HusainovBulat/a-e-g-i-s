'use client';

import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'activity' | 'alert' | 'arrowRight' | 'arrowUpRight' | 'bell' | 'body' | 'check' | 'clock' | 'close'
  | 'globe' | 'heart' | 'lungs' | 'mic' | 'moon' | 'mountain' | 'phone' | 'play' | 'scan' | 'send'
  | 'sliders' | 'stop' | 'user' | 'volume' | 'warning' | 'zap' | 'dizzy' | 'fall' | 'list' | 'shield';

const paths: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l2-7 4 14 3-9 2 2h3" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9" /><path d="M10 21h4" /></>,
  body: <><circle cx="12" cy="4.5" r="2.5" /><path d="M8 22v-7l-2-1V9.5A2.5 2.5 0 0 1 8.5 7h7A2.5 2.5 0 0 1 18 9.5V14l-2 1v7M12 15v7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  heart: <path d="M20.8 8.7c0 5.2-8.8 11-8.8 11S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z" />,
  lungs: <><path d="M12 4v8M12 10c-1.5 0-3-1-3-1M12 10c1.5 0 3-1 3-1" /><path d="M8.5 7C5 7 3 13 3 17c0 2 1 3 3 3 3 0 3-3 3-6V8M15.5 7C19 7 21 13 21 17c0 2-1 3-3 3-3 0-3-3-3-6V8" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  mountain: <path d="m2 20 7-12 4 6 3-4 6 10H2Z" />,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8" /></>,
  send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  volume: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  warning: <><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5M12 17.5h.01" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  dizzy: <><circle cx="12" cy="12" r="9" /><path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4 4 6 6 0 0 1 6-6" /></>,
  fall: <><circle cx="17" cy="5" r="2" /><path d="m14 8-5 3 2 4-4 4M11 15l5 1 2 5M3 21h18" /></>,
  shield: <><path d="M12 21.5s7.5-3.6 7.5-10V5.2L12 2.5 4.5 5.2v6.3c0 6.4 7.5 10 7.5 10Z" /><path d="M7.5 12h2.5l1.2-2.5 1.8 5 1.2-2.5h2.3" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}
