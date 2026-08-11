import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginScreen from '@/components/LoginScreen';
import SystemManagement from '@/components/admin/SystemManagement';
import DocumentRegistry from '@/components/registry/DocumentRegistry';
import { Shield, Settings, FileText, LogOut, Building2 } from 'lucide-react';

type MainTab = 'system' | 'registry';

function AppContent() {
  const { user, loading, needsBootstrap, signOut } = useAuth();
  const [tab, setTab] = useState<MainTab>('registry');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card px-8 py-6 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-neutral-600">Загрузка системы...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-header sticky top-0 z-30 no-print">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-neutral-800 leading-tight">Реестр УПД</h1>
              <p className="text-xs text-neutral-500 leading-tight">Управление и двухэтапный контроль</p>
            </div>
          </div>

          {/* Tabs */}
          {isAdmin && (
            <div className="flex gap-1 p-1 rounded-xl bg-neutral-100/50">
              <button
                onClick={() => setTab('system')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === 'system' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Settings className="w-4 h-4" /> Управление Системой
              </button>
              <button
                onClick={() => setTab('registry')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === 'registry' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <FileText className="w-4 h-4" /> Реестр Документов
              </button>
            </div>
          )}

          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium text-neutral-700">{user.full_name}</p>
              <p className="text-xs text-neutral-400">{roleLabel(user.role)}</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-neutral-200 flex items-center justify-center text-sm font-semibold text-neutral-600">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <button onClick={signOut} className="p-2 rounded-xl text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Выйти">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {isAdmin && tab === 'system' ? <SystemManagement /> : <DocumentRegistry />}
      </main>
    </div>
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Администратор',
    AUTHOR: 'Автор (Кассир)',
    CHECKER1: 'Проверяющий №1',
    CHECKER2: 'Проверяющий №2',
    DEPT_HEAD: 'Руководитель отдела',
    COMPANY_HEAD: 'Руководитель организации',
  };
  return labels[role] || role;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
