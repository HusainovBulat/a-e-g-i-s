import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'A.E.G.I.S. | Mission Control',
  description: 'Simulated EVA health and crew-readiness mission control console.',
  applicationName: 'A.E.G.I.S. Mission Control',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
