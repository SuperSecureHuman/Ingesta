import type { Metadata } from 'next';
import './globals.css';
import { AppContextProvider } from '@/context/AppContext';
import { ToastProvider } from '@/context/ToastContext';
import { SelectionProvider } from '@/context/SelectionContext';

export const metadata: Metadata = {
  title: 'HLS Media Review',
  description: 'HLS streaming and media management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#1a1a1a' }}>
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
