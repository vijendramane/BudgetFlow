// app/(auth)/sign-in/[[...sign-in]]/page.tsx

import { SignIn } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignInPage() {
  return (
    <div style={{
      minHeight:      '100vh',
      width:          '100%',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     'monospace',
      position:       'relative',
      overflow:       'hidden',
      padding:        '40px 16px',
      boxSizing:      'border-box',
    }}>

      {/* Background grid */}
      <div style={{
        position:        'absolute',
        inset:           0,
        opacity:         0.03,
        backgroundImage: 'linear-gradient(#60a5fa 1px, transparent 1px), linear-gradient(90deg, #60a5fa 1px, transparent 1px)',
        backgroundSize:  '48px 48px',
        pointerEvents:   'none',
      }} />

      {/* Blue glow */}
      <div style={{
        position:   'absolute',
        top:        '15%',
        left:       '50%',
        transform:  'translateX(-50%)',
        width:      700,
        height:     300,
        background: 'radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Brand */}
      <div style={{ marginBottom: 36, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize:    36,
          fontWeight:  900,
          letterSpacing: '0.12em',
          color:       '#60a5fa',
          marginBottom: 8,
          textShadow:  '0 0 40px rgba(96,165,250,0.35)',
        }}>
          BUDGETFLOW
        </div>
        <div style={{
          fontSize:      9,
          color:         '#334155',
          letterSpacing: '0.3em',
          marginBottom:  10,
        }}>
          INTELLIGENCE PLATFORM
        </div>
        <div style={{
          display:       'inline-block',
          fontSize:      10,
          color:         '#1e3a5f',
          letterSpacing: '0.1em',
          border:        '1px solid #1e2d45',
          padding:       '3px 12px',
          borderRadius:  3,
        }}>
          Government Fund Flow Analysis · FY 2024–25
        </div>
      </div>

      {/* Clerk card — centered via margin auto */}
      <div style={{
        position:  'relative',
        zIndex:    1,
        width:     '100%',
        maxWidth:  '420px',
        margin:    '0 auto',
      }}>
        <SignIn
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary:         '#3b82f6',
              colorBackground:      '#0f172a',
              colorText:            '#e2e8f0',
              colorTextSecondary:   '#64748b',
              colorInputBackground: '#060d1a',
              colorInputText:       '#e2e8f0',
              colorNeutral:         '#1e2d45',
              borderRadius:         '8px',
              fontSize:             '13px',
              fontFamily:           'monospace',
            },
            elements: {
              rootBox: {
                width: '100%',
              },
              card: {
                width:        '100%',
                background:   '#0f172a',
                border:       '1px solid #1e2d45',
                boxShadow:    '0 0 0 1px rgba(96,165,250,0.05), 0 24px 60px rgba(0,0,0,0.8)',
                borderRadius: '12px',
                padding:      '28px 28px',
              },
              headerTitle: {
                color:         '#e2e8f0',
                fontWeight:    '700',
                fontSize:      '17px',
                fontFamily:    'monospace',
                letterSpacing: '0.04em',
              },
              headerSubtitle: {
                color:    '#475569',
                fontSize: '12px',
              },
              socialButtonsBlockButton: {
                background:   '#060d1a',
                border:       '1px solid #1e2d45',
                color:        '#cbd5e1',
                borderRadius: '6px',
                fontFamily:   'monospace',
                fontSize:     '12px',
              },
              dividerLine: { background: '#1e2d45' },
              dividerText: { color: '#334155', fontSize: '11px' },
              formFieldLabel: {
                color:         '#64748b',
                fontSize:      '10px',
                fontFamily:    'monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              },
              formFieldInput: {
                background:   '#060d1a',
                border:       '1px solid #1e2d45',
                color:        '#e2e8f0',
                borderRadius: '6px',
                fontFamily:   'monospace',
                fontSize:     '13px',
              },
              formButtonPrimary: {
                background:    'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color:         '#fff',
                fontWeight:    '600',
                fontFamily:    'monospace',
                letterSpacing: '0.08em',
                fontSize:      '13px',
                borderRadius:  '6px',
                boxShadow:     '0 0 20px rgba(37,99,235,0.25)',
              },
              footerActionText: { color: '#334155', fontSize: '11px' },
              footerActionLink: { color: '#60a5fa', fontSize: '11px' },
            },
          }}
        />
      </div>

      {/* Footer tag */}
      <div style={{
        position:      'relative',
        zIndex:        1,
        marginTop:     28,
        color:         '#1e2d45',
        fontSize:      '10px',
        fontFamily:    'monospace',
        letterSpacing: '0.12em',
        textAlign:     'center',
      }}>
        SECURED · PFMS INTEGRATED · CAG COMPLIANT
      </div>

    </div>
  )
}