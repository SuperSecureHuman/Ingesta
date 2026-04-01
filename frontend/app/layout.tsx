import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppContextProvider } from '@/context/AppContext';
import { SelectionProvider } from '@/context/SelectionContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import ConditionalLayout from '@/components/layout/ConditionalLayout';
import PageTransition from '@/components/layout/PageTransition';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
});

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
    <html lang="en" className={`dark ${geistSans.variable}`}>
      <body className="font-sans antialiased">
        <AppContextProvider>
          <SelectionProvider>
            <TooltipProvider delay={300}>
              <ConditionalLayout>
                <PageTransition>{children}</PageTransition>
              </ConditionalLayout>
            </TooltipProvider>
          </SelectionProvider>
        </AppContextProvider>
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
