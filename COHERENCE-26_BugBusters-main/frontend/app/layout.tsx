import type { Metadata } from 'next'
import { Syne, Space_Mono, DM_Sans } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import dynamic from 'next/dynamic'

const CopilotPanel = dynamic(() => import('@/components/copilot/CopilotPanel'), { ssr: false })

const syne      = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['400','600','700','800'] })
const spaceMono = Space_Mono({ subsets: ['latin'], variable: '--font-space-mono', weight: ['400','700'] })
const dmSans    = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })

export const metadata: Metadata = {
  title: 'Budget Flow Intelligence',
  description: 'National Budget Flow Intelligence & Leakage Detection Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${syne.variable} ${spaceMono.variable} ${dmSans.variable}`}>
        <body style={{ margin: 0, background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TopBar />
              <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {children}
              </main>
            </div>
          </div>
          <CopilotPanel />
        </body>
      </html>
    </ClerkProvider>
  )
}