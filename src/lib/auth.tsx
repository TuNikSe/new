import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, apiGetCurrentUser, apiLogin, apiLogout, apiBootstrap, apiCheckBootstrap, type AppUser } from '@/lib/supabase';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  needsBootstrap: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  bootstrap: (login: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  const refreshUser = async () => {
    const u = await apiGetCurrentUser();
    setUser(u);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { needs_bootstrap } = await apiCheckBootstrap();
        if (!cancelled) {
          setNeedsBootstrap(needs_bootstrap);
          setLoading(false);
        }
        return;
      }
      const u = await apiGetCurrentUser();
      if (cancelled) return;
      if (!u) {
        const { needs_bootstrap } = await apiCheckBootstrap();
        if (!cancelled) setNeedsBootstrap(needs_bootstrap);
      } else {
        setUser(u);
        setNeedsBootstrap(false);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          const { needs_bootstrap } = await apiCheckBootstrap();
          if (!cancelled) setNeedsBootstrap(needs_bootstrap);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const u = await apiGetCurrentUser();
          if (!cancelled) {
            setUser(u);
            setNeedsBootstrap(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (login: string, password: string) => {
    await apiLogin(login, password);
    const u = await apiGetCurrentUser();
    setUser(u);
    setNeedsBootstrap(false);
  };

  const bootstrap = async (login: string, password: string, fullName: string) => {
    await apiBootstrap(login, password, fullName);
    await apiLogin(login, password);
    const u = await apiGetCurrentUser();
    setUser(u);
    setNeedsBootstrap(false);
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
    const { needs_bootstrap } = await apiCheckBootstrap();
    setNeedsBootstrap(needs_bootstrap);
  };

  return (
    <AuthContext.Provider value={{ user, loading, needsBootstrap, signIn, bootstrap, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
