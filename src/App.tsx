import { ThemeProvider } from '@/state/ThemeContext';
import { AppStateProvider } from '@/state/AppStateContext';
import { AiAssistProvider } from '@/state/AiAssistContext';
import { AppShell } from '@/components/layout/AppShell';
import { useAppState } from '@/hooks/useAppState';
import { UploadStep } from '@/components/upload/UploadStep';
import { ReviewAndGenerateStep } from '@/components/review/ReviewAndGenerateStep';
import { ResultsStep } from '@/components/results/ResultsStep';

function StepRouter() {
  const { state } = useAppState();
  switch (state.step) {
    case 'upload':
      return <UploadStep />;
    case 'review':
      return <ReviewAndGenerateStep />;
    case 'results':
      return <ResultsStep />;
    default:
      return null;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AiAssistProvider>
        <AppStateProvider>
          <AppShell>
            <StepRouter />
          </AppShell>
        </AppStateProvider>
      </AiAssistProvider>
    </ThemeProvider>
  );
}

export default App;
