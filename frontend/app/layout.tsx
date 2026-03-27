import type { Metadata } from 'next';
import './globals.css';
import { AppContextProvider } from '@/context/AppContext';
import { ToastProvider } from '@/context/ToastContext';

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
          <ToastProvider>{children}</ToastProvider>
        </AppContextProvider>
      </body>
    </html>
  );
}
