import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from './sw-register';

export const metadata: Metadata = {
  title: 'RallyShare',
  description: 'Envia as tuas fotos e clips de rally para a transmissão.',
  applicationName: 'RallyShare',
  appleWebApp: {
    capable: true,
    title: 'RallyShare',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
