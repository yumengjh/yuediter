import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";

export interface Workspace {
  workspaceId: string;
  name: string;
  description?: string;
  icon?: string;
  userRole: string;
  memberCount: number;
  documentCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listWorkspaces(
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<Workspace>> {
  return apiGet<PaginatedResponse<Workspace>>(
    `/workspaces?page=${page}&pageSize=${pageSize}`,
  );
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  return apiGet<Workspace>(`/workspaces/${workspaceId}`);
}

export async function createWorkspace(data: {
  name: string;
  description?: string;
  icon?: string;
}): Promise<Workspace> {
  return apiPost<Workspace>("/workspaces", data);
}

export async function updateWorkspace(
  workspaceId: string,
  data: { name?: string; description?: string; icon?: string },
): Promise<Workspace> {
  return apiPatch<Workspace>(`/workspaces/${workspaceId}`, data);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return apiDelete(`/workspaces/${workspaceId}`);
}
