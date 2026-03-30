import type { Metadata } from 'next';
import './globals.css';
import { AppContextProvider } from '@/context/AppContext';
import { ToastProvider } from '@/context/ToastContext';
import { SelectionProvider } from '@/context/SelectionContext';

export const metadata: Metadata = {
  title: 'Ingesta',
  description: 'HLS streaming and media management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#0f0f0f' }}>
      <body>
        <AppContextProvider>
          <ToastProvider>
            <SelectionProvider>{children}</SelectionProvider>
          </ToastProvider>
        </AppContextProvider>
      </body>
    </html>
  );
}
