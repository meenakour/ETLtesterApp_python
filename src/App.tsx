import { ThemeProvider } from '@/state/ThemeContext';
import { AppStateProvider } from '@/state/AppStateContext';
import { AiAssistProvider } from '@/state/AiAssistContext';
import { AppShell } from '@/components/layout/AppShell';
import { useAppState } from '@/hooks/useAppState';
import { UploadStep } from '@/components/upload/UploadStep';
import { PreviewStep } from '@/components/preview/PreviewStep';
import { CategorySelectionStep } from '@/components/categories/CategorySelectionStep';
import { ResultsStep } from '@/components/results/ResultsStep';

function StepRouter() {
  const { state } = useAppState();
  switch (state.step) {
    case 'upload':
      return <UploadStep />;
    case 'preview':
      return <PreviewStep />;
    case 'categories':
      return <CategorySelectionStep />;
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
