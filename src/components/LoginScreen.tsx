import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Shield, LogIn, UserPlus, Lock, User, Sparkles } from 'lucide-react';

export default function LoginScreen() {
  const { signIn, bootstrap, needsBootstrap } = useAuth();
  const [mode, setMode] = useState<'login' | 'bootstrap'>(needsBootstrap ? 'bootstrap' : 'login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(login.trim(), password);
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await bootstrap(login.trim(), password, fullName.trim());
    } catch {
      setError('Не удалось создать администратора. Возможно, система уже инициализирована.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-800">Реестр УПД</h1>
          <p className="text-sm text-neutral-500 mt-1">Управление и двухэтапный контроль</p>
        </div>

        <div className="glass-card p-8 animate-fade-in">
          {needsBootstrap && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Первичная инициализация</p>
                <p className="text-xs text-amber-700 mt-1">Создайте учётную запись главного администратора. Публичная регистрация отсутствует.</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-6 p-1 rounded-xl bg-neutral-100/50">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <LogIn className="w-4 h-4" /> Вход
            </button>
            {needsBootstrap && (
              <button
                onClick={() => setMode('bootstrap')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === 'bootstrap' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <UserPlus className="w-4 h-4" /> Инициализация
              </button>
            )}
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Логин (псевдоним)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 text-sm"
                    placeholder="Введите логин"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 text-sm"
                    placeholder="Введите пароль"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-sm text-error-600 animate-fade-in">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Вход...' : 'Войти в систему'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">ФИО администратора</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 text-sm"
                  placeholder="Иванов Иван Иванович"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Логин</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 text-sm"
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 text-sm"
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-sm text-error-600 animate-fade-in">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Создание...' : 'Создать администратора'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">
          Закрытая система авторизации. Регистрация отсутствует.
        </p>
      </div>
    </div>
  );
}
