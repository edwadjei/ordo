import type { Metadata } from 'next';
import './globals.css';
import type { ReactNode } from 'react';
export const metadata: Metadata = {
  title: 'Ordo — From thought to done.',
  description:
    'A calm personal workspace for thoughts, projects, and your next steps.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
