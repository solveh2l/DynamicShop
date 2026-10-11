import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const sans = Inter({ subsets: ['latin'], variable: '--font-sans' })
const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'DynamicShop | Products designed from unmet demand',
  description:
    'DynamicShop detects unmet shopper demand, generates real products, and measures genuine purchase intent through sponsored concepts.',
}

export const viewport: Viewport = {
  themeColor: '#faf7f2',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
