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
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ordo.theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
