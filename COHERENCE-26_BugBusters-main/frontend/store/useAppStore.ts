import { create } from 'zustand'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  intent?: string
  source?: 'groq' | 'rule'
}

interface AppState {
  selectedYear:       number
  selectedMonth:      number
  setYear:            (y: number) => void
  setMonth:           (m: number) => void

  copilotOpen:        boolean
  chatHistory:        ChatMessage[]
  toggleCopilot:      () => void
  addMessage:         (msg: ChatMessage) => void
  clearChat:          () => void

  pendingActionCount: number
  setPendingCount:    (n: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedYear:       2024,
  selectedMonth:      8,
  setYear:            (y) => set({ selectedYear: y }),
  setMonth:           (m) => set({ selectedMonth: m }),

  copilotOpen:        false,
  chatHistory:        [],
  toggleCopilot:      () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  addMessage:         (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),
  clearChat:          () => set({ chatHistory: [] }),

  pendingActionCount: 0,
  setPendingCount:    (n) => set({ pendingActionCount: n }),
}))