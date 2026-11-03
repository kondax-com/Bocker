import type { Metadata } from 'next'
import { Sidebar } from '@/components/common'
import '@/app/globals.css'
import './dashboard.css'
import { ThemeProvider } from 'next-themes'
import { ChannelTalkLoader } from '@/components/common/ChannelTalkLoader'

export const metadata: Metadata = {
  title: 'Bocker - ダッシュボード',
  description: 'Bockerはサロンの予約管理を便利にするサービスです。',
}
// global.d.ts
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ChannelIO?: (command: string, options?: any) => void
    ChannelIOInitialized?: boolean
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        storageKey="dashboard-theme"
        enableSystem
      >
        <Sidebar>{children}</Sidebar>
      </ThemeProvider>

      <ChannelTalkLoader />
    </>
  )
}
