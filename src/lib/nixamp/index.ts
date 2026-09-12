/**
 * nixamp.com, from bittorrented.com's side.
 *
 * nixamp is the OAuth 2.1 authorization server; we are the client. A watch
 * party here becomes a room there, so the same party is joinable from every
 * nixamp surface without any of them learning anything about torrents.
 */

export {
  NIXAMP_DEFAULT_CLIENT_ID,
  NIXAMP_DEFAULT_SITE,
  NIXAMP_OAUTH_STATE_COOKIE,
  NIXAMP_OAUTH_STATE_MAX_AGE_SECONDS,
  NIXAMP_SCOPES,
  getAppOrigin,
  getNixampOAuthConfig,
  isNixampConfigured,
  type NixampOAuthConfig,
} from './config';

export {
  NixampOAuthError,
  buildAuthUrl,
  codeChallenge,
  computeExpiresAt,
  discover,
  exchangeCodeForTokens,
  fetchUserInfo,
  generateCodeVerifier,
  generateState,
  refreshTokens,
  revokeToken,
  type NixampMetadata,
  type NixampTokenResponse,
  type NixampUserInfo,
} from './oauth';

export {
  NixampConnectionLost,
  disconnectNixampAccount,
  getNixampAccount,
  upsertNixampAccount,
  usableAccessToken,
  type NixampAccount,
} from './accounts';

export {
  NixampNotConnected,
  bridgeParty,
  endBridgedParty,
  getBridgedRoom,
  pushPlayback,
  watchPartyUrl,
  type BridgedRoom,
} from './rooms';
