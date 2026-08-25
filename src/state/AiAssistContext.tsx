import { createContext, useEffect, useState, type ReactNode } from 'react';

const ENABLED_KEY = 'etl-tester-ai-assist-enabled';
const SERVER_URL_KEY = 'etl-tester-ai-assist-server-url';
export const DEFAULT_AI_ASSIST_SERVER_URL = 'http://localhost:8787';

interface AiAssistContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

export const AiAssistContext = createContext<AiAssistContextValue | undefined>(undefined);

export function AiAssistProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ENABLED_KEY) === 'true';
  });
  const [serverUrl, setServerUrlState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_AI_ASSIST_SERVER_URL;
    return window.localStorage.getItem(SERVER_URL_KEY) || DEFAULT_AI_ASSIST_SERVER_URL;
  });

  useEffect(() => {
    window.localStorage.setItem(ENABLED_KEY, String(enabled));
  }, [enabled]);

  useEffect(() => {
    window.localStorage.setItem(SERVER_URL_KEY, serverUrl);
  }, [serverUrl]);

  const setEnabled = (value: boolean) => setEnabledState(value);
  const setServerUrl = (value: string) => setServerUrlState(value);

  return (
    <AiAssistContext.Provider value={{ enabled, setEnabled, serverUrl, setServerUrl }}>
      {children}
    </AiAssistContext.Provider>
  );
}
