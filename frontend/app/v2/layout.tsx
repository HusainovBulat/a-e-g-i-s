import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'A.E.G.I.S. v2 · Crew health console',
  description: 'Offline health monitoring for lunar EVA crews: fatigue early warning, emergency triage and evening readiness check-in.',
  applicationName: 'A.E.G.I.S.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0f14' };

export default function V2Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
