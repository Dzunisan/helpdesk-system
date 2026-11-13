import './App.css';
import { AuthProvider } from './context/AuthContext';
import AppRouter from './routes/AppRouter';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

function App() {
  return (
    <AuthProvider>
      {/* One app-wide provider so any page can use Tooltip */}
      <TooltipProvider delayDuration={300}>
        <AppRouter />
      </TooltipProvider>
      {/* The one toast system (briefing p.34 #5): call toast.success / toast.error anywhere */}
      {/* Light until the app has a theme provider and dark mode; otherwise next-themes'
          "system" default gives dark toasts on a light app */}
      <Toaster theme="light" richColors position="top-right" />
    </AuthProvider>
  );
}


export default App;
