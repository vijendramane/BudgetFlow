// app/(auth)/layout.tsx
// NO html/body here — only app/layout.tsx can have those
// position:fixed covers the dashboard layout bleeding through underneath

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      zIndex:     9999,
      background: '#0a0e1a',
      overflow:   'auto',
    }}>
      {children}
    </div>
  )
}