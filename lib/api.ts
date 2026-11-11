// Same-origin by default: API routes live under /api in this Next.js app, so the
// client works wherever the frontend is served from (localhost, LAN IP, etc.).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Module-level token set by the auth store after login/hydration
let _authToken: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

export function getApiBase(): string {
  return API_BASE;
}

/** Called when an authenticated request gets a 401 (expired/revoked token). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  _onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // e.g. an HTML error page from a proxy
  }
}

/** FastAPI returns validation errors as an array of {msg} objects. */
function errorMessage(body: unknown, status: number): string {
  const b = body as { detail?: unknown; message?: unknown } | null;
  if (typeof b?.detail === "string") return b.detail;
  if (Array.isArray(b?.detail) && typeof b.detail[0]?.msg === "string") return b.detail[0].msg;
  if (typeof b?.message === "string") return b.message;
  return status >= 500 ? "Server error. Please try again." : "Request failed";
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = parseBody(await res.text());

  if (!res.ok) {
    if (res.status === 401 && _authToken) _onUnauthorized?.();
    throw new ApiError(res.status, errorMessage(body, res.status));
  }

  return (body ?? undefined) as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export const auth = {
  login(payload: LoginPayload) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  register(payload: RegisterPayload) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  forgotPassword(email: string) {
    return request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ── Rooms ─────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  name: string;
  join_code?: string;
  host_id?: string;
  is_password_protected?: boolean;
  start_time?: string | null;
  /** People connected to the call right now. */
  participant_count?: number;
  member_count?: number;
  created_at?: string;
  participants?: Array<{ id: string; name: string; avatar?: string }>;
}

export interface JoinByCodePayload {
  code: string;
  password?: string;
}

export interface JoinByCodeResponse {
  roomId: string;
  joinCode: string;
  requiresPassword?: boolean;
}

export interface CreateRoomPayload {
  name: string;
  password?: string;
}

export interface CreateRoomResponse {
  id: string;
  name: string;
  join_code: string;
  host_id: string;
  is_password_protected: boolean;
  participant_count: number;
  created_at: string;
}

export interface RoomMessagePayload {
  text?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
}

export interface RoomMessage {
  id: string;
  senderId: string;
  senderName: string;
  payload: RoomMessagePayload;
  sentAt: string;
}

export interface RoomFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
  downloadUrl?: string;
  roomId?: string;
  roomName?: string;
  roomOwnerId?: string;
  isFavorite?: boolean;
  deletedAt?: string | null;
}

export type FileListItem = RoomFile;

export interface WhiteboardStroke {
  strokeId: string;
  action: "add" | "update" | "remove";
  objectData: unknown;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface FilePresignRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  roomId: string;
}

export interface FilePresignResponse {
  uploadUrl: string;
  fileId: string;
}

export interface FileConfirmRequest {
  fileId: string;
  roomId: string;
}

export type FileConfirmResponse = RoomFile;

export const rooms = {
  list() {
    return request<Room[]>("/rooms");
  },
  get(id: string) {
    return request<Room>(`/rooms/${id}`);
  },
  messages(id: string) {
    return request<RoomMessage[]>(`/rooms/${id}/messages`);
  },
  files(id: string) {
    return request<RoomFile[]>(`/rooms/${id}/files`);
  },
  whiteboard(id: string) {
    return request<WhiteboardStroke[]>(`/rooms/${id}/whiteboard`);
  },
  joinByCode(payload: JoinByCodePayload) {
    return request<JoinByCodeResponse>("/rooms/join-by-code", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  create(payload: CreateRoomPayload) {
    return request<CreateRoomResponse>("/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

export const files = {
  list() {
    return request<FileListItem[]>("/files");
  },
  usage() {
    return request<{ totalBytes: number; totalGb: number; limitGb: number; limitBytes?: number }>(
      "/files/usage",
    );
  },
  presign(payload: FilePresignRequest) {
    return request<FilePresignResponse>("/files/presign", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  confirm(payload: FileConfirmRequest) {
    return request<FileConfirmResponse>("/files/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  favorite(fileId: string) {
    return request<{ message: string }>(`/files/${encodeURIComponent(fileId)}/favorite`, {
      method: "POST",
    });
  },
  unfavorite(fileId: string) {
    return request<{ message: string }>(`/files/${encodeURIComponent(fileId)}/favorite`, {
      method: "DELETE",
    });
  },
  rename(fileId: string, name: string) {
    return request<RoomFile>(`/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },
  softDelete(fileId: string) {
    return request<{ message: string }>(`/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
  },
  restore(fileId: string) {
    return request<{ message: string }>(`/files/${encodeURIComponent(fileId)}/restore`, {
      method: "POST",
    });
  },
  deleteForever(fileId: string) {
    return request<{ message: string }>(`/files/${encodeURIComponent(fileId)}/delete`, {
      method: "DELETE",
    });
  },
  async download(fileId: string) {
    const res = await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}/download`, {
      headers: {
        ...( _authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
      },
    });
    if (!res.ok) {
      const body = parseBody(await res.text().catch(() => ""));
      throw new ApiError(res.status, body ? errorMessage(body, res.status) : "Unable to download file.");
    }
    return res.blob();
  },
};

/** Upload a file through presign → PUT → confirm. */
export async function uploadFile(
  file: File,
  roomId: string | null,
  onProgress?: (fraction: number) => void,
): Promise<RoomFile> {
  const presign = await files.presign({
    roomId: roomId ?? "",
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presign.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, errorMessage(parseBody(xhr.responseText), xhr.status)));
    };
    xhr.onerror = () => reject(new Error("File upload failed. Check your connection."));
    xhr.send(file);
  });
  return files.confirm({ fileId: presign.fileId, roomId: roomId ?? "" });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface UserStats {
  meetingsAttended: number;
  hoursOnline: number;
  filesShared: number;
  roomsCreated: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
}

export interface UserSettings {
  status: "online" | "away" | "dnd" | "offline";
  notifications: {
    meetingReminders: boolean;
    chatMessages: boolean;
    fileUploads: boolean;
    sounds: boolean;
  };
  theme: "dark" | "light" | "system";
}

export const users = {
  me() {
    return request<UserProfile>("/users/me");
  },
  stats() {
    return request<UserStats>("/users/me/stats");
  },
  updateMe(payload: Partial<Pick<UserProfile, "name" | "bio" | "avatarUrl">>) {
    return request<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  settings() {
    return request<UserSettings>("/users/me/settings");
  },
  updateSettings(settings: Partial<UserSettings>) {
    return request<UserSettings>("/users/me/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  },
  signIns() {
    return request<SignInEntry[]>("/users/me/sessions");
  },
  online() {
    return request<OnlineUser[]>("/users/online");
  },
  deleteMe(password: string) {
    return request<{ message: string }>("/users/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
  },
  async exportData(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/users/me/export`, {
      headers: _authToken ? { Authorization: `Bearer ${_authToken}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Unable to export your data.");
    return res.blob();
  },
};

export interface SignInEntry {
  id: string;
  userAgent: string;
  ip: string;
  success: boolean;
  at: string;
}

export interface OnlineUser {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType = "join" | "upload" | "mention" | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  payload?: { roomId?: string; fileId?: string; targetUrl?: string };
}

export const notificationsApi = {
  list() {
    return request<AppNotification[]>("/notifications");
  },
  markAllRead() {
    return request<{ message: string }>("/notifications/mark-all-read", {
      method: "POST",
    });
  },
  markRead(id: string) {
    return request<{ message: string }>(`/notifications/${id}/read`, {
      method: "PATCH",
    });
  },
};
