/**
 * scCloud v2 — API 调用工具库
 * 统一封装所有后端 API 调用，自动注入 JWT + 错误处理。
 *
 * 所有请求均使用相对路径 (/api/...)
 * 本地开发: Next.js rewrites 代理至后端
 * 生产环境: Nginx 反代 /api/* → backend:8000
 */

/** API 基地址 — 空字符串表示同源相对路径 */
const API_BASE = "";

/** 通用 fetch 封装 — 自动注入 auth header */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("access_token")
      : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  /* 如果 body 不是 FormData，默认 JSON content type */
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    /* 401 = token 过期或无效 → 清除登录态，跳转登录页 */
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("username");
      window.location.href = "/login";
      throw new Error("登录已过期，请重新登录");
    }

    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  // 204 No Content — 无响应体，直接返回 undefined
  if (res.status === 204) return undefined as T;

  return res.json();
}

/* ===== Auth ===== */

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  username: string;
}

export async function login(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  if (!res.ok) throw new Error("登录失败");
  return res.json();
}

export async function register(
  username: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/* ===== Projects ===== */

export interface Project {
  id: number;
  name: string;
  description: string | null;
  species: string;
  status: string;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectList {
  total: number;
  projects: Project[];
}

export async function listProjects(): Promise<ProjectList> {
  return apiFetch<ProjectList>("/api/projects");
}

export async function createProject(data: {
  name: string;
  description?: string;
  species?: string;
}): Promise<Project> {
  return apiFetch<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: number): Promise<void> {
  await apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" });
}

/* ===== Tasks ===== */

export interface Task {
  id: string;
  project_id: number;
  step: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  params: Record<string, unknown> | null;
  result_path: string | null;
  error_msg: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TaskList {
  total: number;
  tasks: Task[];
}

export async function submitTask(data: {
  project_id: number;
  step: string;
  params?: Record<string, unknown>;
}): Promise<Task> {
  return apiFetch<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listTasks(
  projectId?: number,
  status?: string
): Promise<TaskList> {
  const params = new URLSearchParams();
  if (projectId !== undefined) params.set("project_id", String(projectId));
  if (status) params.set("status", status);
  return apiFetch<TaskList>(`/api/tasks?${params.toString()}`);
}

export async function getTask(taskId: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${taskId}`);
}

export async function cancelTask(taskId: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${taskId}/cancel`, { method: "POST" });
}

/* ===== WebSocket ===== */

/**
 * 创建 WebSocket 连接，监听任务进度。
 * R 引擎通过 Redis PUBLISH → FastAPI → WS → 前端
 */
export function connectTaskWS(
  taskId: string,
  onProgress: (data: { progress: number; message: string }) => void,
  onComplete?: () => void,
  onError?: (msg: string) => void
): WebSocket {
  /* 从当前页面 URL 自动推导 WebSocket 地址（同源） */
  const loc = typeof window !== "undefined" ? window.location : null;
  const wsProto = loc?.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = loc?.host || "localhost:8000";
  const ws = new WebSocket(`${wsProto}//${wsHost}/ws/tasks/${taskId}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onProgress(data);

    if (data.progress >= 100) {
      onComplete?.();
    }
    if (data.status === "failed") {
      onError?.(data.error_msg || "分析任务失败");
    }
  };

  ws.onerror = () => {
    onError?.("WebSocket 连接失败");
  };

  return ws;
}

/* ===== Health ===== */

export async function healthCheck(): Promise<{
  status: string;
  version: string;
  db: string;
  redis: string;
}> {
  return apiFetch("/api/health");
}

/* ===== 分片上传 ===== */

interface UploadProgress {
  phase: "uploading" | "merging" | "done";
  percent: number;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * 分片上传大文件 (RDS/H5AD)。
 * 流程: init → chunk × N → complete
 *
 * @param file 前端 File 对象
 * @param projectId 关联的项目 ID (可选)
 * @param onProgress 进度回调
 * @returns 上传完成后的服务端文件路径
 */
export async function uploadFileChunked(
  file: File,
  projectId?: number,
  onProgress?: (p: UploadProgress) => void
): Promise<{ path: string; filename: string; size_mb: number }> {
  /* 1. 初始化上传 */
  const initForm = new FormData();
  initForm.append("filename", file.name);
  initForm.append("file_size", String(file.size));

  const initRes = await apiFetch<{ upload_id: string; chunk_size: number }>(
    "/api/upload/init",
    { method: "POST", body: initForm }
  );

  const { upload_id, chunk_size } = initRes;
  const totalChunks = Math.ceil(file.size / chunk_size);

  /* 2. 逐片上传 */
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunk_size;
    const end = Math.min(start + chunk_size, file.size);
    const blob = file.slice(start, end);

    const chunkForm = new FormData();
    chunkForm.append("upload_id", upload_id);
    chunkForm.append("chunk_index", String(i));
    chunkForm.append("chunk", blob, `chunk_${i}`);

    await apiFetch("/api/upload/chunk", {
      method: "POST",
      body: chunkForm,
    });

    onProgress?.({
      phase: "uploading",
      percent: Math.round(((i + 1) / totalChunks) * 90),
      chunkIndex: i + 1,
      totalChunks,
    });
  }

  /* 3. 合并分片 */
  onProgress?.({
    phase: "merging",
    percent: 95,
    chunkIndex: totalChunks,
    totalChunks,
  });

  const completeForm = new FormData();
  completeForm.append("upload_id", upload_id);
  if (projectId !== undefined) {
    completeForm.append("project_id", String(projectId));
  }

  const result = await apiFetch<{
    status: string;
    path: string;
    filename: string;
    size_mb: number;
    total_chunks: number;
  }>("/api/upload/complete", {
    method: "POST",
    body: completeForm,
  });

  onProgress?.({
    phase: "done",
    percent: 100,
    chunkIndex: totalChunks,
    totalChunks,
  });

  return {
    path: result.path,
    filename: result.filename,
    size_mb: result.size_mb,
  };
}

