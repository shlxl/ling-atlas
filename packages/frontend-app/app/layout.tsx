import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'Ling Atlas · Frontend App',
  description: 'API consumer demo for Ling Atlas'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
