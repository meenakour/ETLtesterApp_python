import { useContext } from 'react';
import { AiAssistContext } from '@/state/AiAssistContext';

export function useAiAssist() {
  const ctx = useContext(AiAssistContext);
  if (!ctx) throw new Error('useAiAssist must be used within an AiAssistProvider');
  return ctx;
}
