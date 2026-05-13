const BASE_URL = "http://localhost:3000/api/v1";

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

// Token 互斥锁，防止并发刷新
let refreshPromise: Promise<boolean> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();
    if (data.success) {
      storeTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

async function refreshTokenOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string | string[] };
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers as Record<string, string>),
  };

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // 401 尝试刷新 token
  if (response.status === 401) {
    const refreshed = await refreshTokenOnce();
    if (refreshed) {
      const newToken = getAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    } else {
      throw new Error("认证已过期，请重新登录");
    }
  }

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    const msg = Array.isArray(result.error?.message)
      ? result.error!.message.join(", ")
      : result.error?.message || "请求失败";
    throw new Error(msg);
  }

  return result.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
