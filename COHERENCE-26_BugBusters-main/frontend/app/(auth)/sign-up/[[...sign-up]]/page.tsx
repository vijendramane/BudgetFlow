import { SignUp } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '0.06em',
          color: '#60a5fa', marginBottom: 6,
        }}>
          BUDGETFLOW
        </div>
        <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.22em' }}>
          INTELLIGENCE PLATFORM
        </div>
      </div>

      <SignUp
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary:         '#3b82f6',
            colorBackground:      '#111827',
            colorText:            '#e2e8f0',
            colorTextSecondary:   '#64748b',
            colorInputBackground: '#0f172a',
            colorInputText:       '#e2e8f0',
            colorNeutral:         '#1e2d45',
            borderRadius:         '8px',
            fontSize:             '14px',
          },
          elements: {
            rootBox:               { width: '100%' },
            card:                  { background: '#111827', border: '1px solid #1e2d45', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' },
            headerTitle:           { color: '#e2e8f0', fontWeight: '700' },
            headerSubtitle:        { color: '#475569' },
            socialButtonsBlockButton: { background: '#0f172a', border: '1px solid #1e2d45', color: '#e2e8f0' },
            socialButtonsBlockButtonText: { color: '#e2e8f0' },
            dividerLine:           { background: '#1e2d45' },
            dividerText:           { color: '#334155' },
            formFieldLabel:        { color: '#94a3b8' },
            formFieldInput:        { background: '#0f172a', border: '1px solid #1e2d45', color: '#e2e8f0' },
            formButtonPrimary:     { background: '#2563eb', color: '#fff', fontWeight: '600' },
            footerActionText:      { color: '#475569' },
            footerActionLink:      { color: '#60a5fa' },
          },
        }}
      />
    </div>
  )
}