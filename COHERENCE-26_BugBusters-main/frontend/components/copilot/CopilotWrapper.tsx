'use client'
import dynamic from 'next/dynamic'
import { useAppStore } from '@/store/useAppStore'

const CopilotPanel = dynamic(() => import('./CopilotPanel'), { ssr: false })

export default function CopilotWrapper() {
  const { copilotOpen } = useAppStore()
  if (!copilotOpen) return null
  return <CopilotPanel />
}