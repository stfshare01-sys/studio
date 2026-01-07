import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import SiteLayout from '@/components/site-layout';

export const metadata: Metadata = {
  title: 'FlowMaster',
  description: 'A custom workflow management system that allows designing request templates with definable fields and steps, submitting and tracking new requests, and visualizing the status and history of each process.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <SiteLayout>
          {children}
        </SiteLayout>
        <Toaster />
      </body>
    </html>
  );
}
