// Shared auth types — safe to import anywhere (no server-only dependencies)

export interface SessionPayload {
  userId: string;
  sessionId: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
}
