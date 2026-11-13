import './App.css';
import { AuthProvider } from './context/AuthContext';
import { UsersProvider } from './context/UsersContext';
import AppRouter from './routes/AppRouter';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <AuthProvider>
      <UsersProvider>
        <AppRouter />
        {/* The one toast system (briefing p.34 #5): call toast.success / toast.error anywhere */}
        {/* Light until the app has a theme provider and dark mode; otherwise next-themes'
            "system" default gives dark toasts on a light app */}
        <Toaster theme="light" richColors position="top-right" />
      </UsersProvider>
    </AuthProvider>
  );
}


export default App;
