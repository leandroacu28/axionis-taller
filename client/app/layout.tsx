import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './lib/theme';

export const metadata: Metadata = {
  title: 'Axionis Taller',
  description: 'Car repair shop / mechanic workshop management system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
