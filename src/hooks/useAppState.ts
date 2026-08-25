import { useContext } from 'react';
import { AppStateContext } from '@/state/AppStateContext';

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
}
