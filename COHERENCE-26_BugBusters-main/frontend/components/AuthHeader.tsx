'use client'

import { UserButton, useUser } from '@clerk/nextjs'

export default function AuthHeader() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      {/* User email / name pill */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 1,
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          color: '#e2e8f0',
          fontWeight: 600,
        }}>
          {user?.firstName || user?.emailAddresses[0]?.emailAddress?.split('@')[0]}
        </span>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 8,
          color: '#475569',
          letterSpacing: '0.08em',
        }}>
          ANALYST
        </span>
      </div>

      {/* Clerk avatar + dropdown (has sign-out built in) */}
      <UserButton
        appearance={{
          variables: {
            colorPrimary:       '#3b82f6',
            colorBackground:    '#111827',
            colorText:          '#e2e8f0',
            borderRadius:       '6px',
          },
          elements: {
            avatarBox: {
              width:  28,
              height: 28,
              border: '1px solid #1e2d45',
            },
            userButtonPopoverCard: {
              background:  '#111827',
              border:      '1px solid #1e2d45',
              boxShadow:   '0 8px 32px rgba(0,0,0,0.6)',
            },
            userButtonPopoverActionButton: {
              color: '#94a3b8',
              fontSize: '12px',
            },
            userButtonPopoverActionButtonText: {
              color: '#94a3b8',
            },
          },
        }}
        afterSignOutUrl="/sign-in"
      />
    </div>
  )
}