/**
 * Root layout: only the document shell. Each UI version brings its own global styles:
 *   app/(v1)/layout.tsx -> original console at /, /phone, /visor
 *   app/v2/layout.tsx   -> redesigned console at /v2, /v2/phone, /v2/visor
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
