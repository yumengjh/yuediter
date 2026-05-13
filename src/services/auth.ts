import { apiGet, apiPost, storeTokens, clearTokens } from "./api-client";

export interface User {
  userId: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  createdAt: string;
}

interface AuthData {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export async function login(
  emailOrUsername: string,
  password: string,
): Promise<User> {
  const data = await apiPost<AuthData>("/auth/login", {
    emailOrUsername,
    password,
  });
  storeTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function register(data: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}): Promise<User> {
  const res = await apiPost<AuthData>("/auth/register", data);
  storeTokens(res.accessToken, res.refreshToken);
  return res.user;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem("refreshToken");
  try {
    await apiPost("/auth/logout", { token: refreshToken });
  } finally {
    clearTokens();
  }
}

export async function getCurrentUser(): Promise<User> {
  return apiGet<User>("/auth/me");
}
