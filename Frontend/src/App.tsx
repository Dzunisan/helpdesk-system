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
        <Toaster richColors position="top-right" />
      </UsersProvider>
    </AuthProvider>
  );
}


export default App;
