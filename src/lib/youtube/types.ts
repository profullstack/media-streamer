/**
 * YouTube integration types.
 */

export interface YouTubeAccount {
  id: string;
  userId: string;
  googleSub: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string; // ISO
  scopes: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Subset of account safe to return to the client (no tokens). */
export interface PublicYouTubeAccount {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  hasSearchAccess: boolean;
  hasSubscriptionManageAccess: boolean;
  hasCommentWriteAccess: boolean;
  createdAt: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}
