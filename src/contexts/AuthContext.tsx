import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  getCurrentUser,
  type User,
} from "../services/auth";
import { isAuthenticated as checkAuth } from "../services/api-client";

interface RegisterData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 挂载时检查 token 并加载用户信息
  useEffect(() => {
    if (!checkAuth()) {
      setLoading(false);
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // token 无效，静默处理
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (emailOrUsername: string, password: string) => {
      setError(null);
      try {
        const u = await authLogin(emailOrUsername, password);
        setUser(u);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "登录失败";
        setError(msg);
        throw e;
      }
    },
    [],
  );

  const register = useCallback(async (data: RegisterData) => {
    setError(null);
    try {
      const u = await authRegister(data);
      setUser(u);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "注册失败";
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
