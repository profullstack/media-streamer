export {
  SEEDBOX_RESOURCE_STATUSES,
  SEEDBOX_TERMINAL_STATUSES,
  canTransitionSeedboxStatus,
  getAllowedSeedboxStatusTargets,
  isSeedboxTerminalStatus,
  requireSeedboxStatusTransition,
  transitionSeedboxResource,
} from './lifecycle';

export type {
  SeedboxProvider,
  SeedboxResource,
  SeedboxResourceKind,
  SeedboxResourceStatus,
} from './lifecycle';

// Transports: hand a torrent off to a seedbox over HTTP (torlink API) or SSH.
export {
  getSeedboxConfig,
  availableTransports,
  isEmailAllowed,
  parseAllowedEmails,
} from './config';

export type {
  SeedboxConfig,
  SeedboxHttpConfig,
  SeedboxSshConfig,
  SeedboxTransport,
  SeedboxHttpAuth,
} from './config';

export {
  getSeedboxAccess,
  sendTorrentToSeedbox,
  isValidMagnet,
} from './send';

export type { SeedboxAccess } from './send';

export type { SendResult } from './http-transport';

// File streaming: proxy completed files from the seedbox file server (torlnk files).
export { buildSeedboxFileUrl, fetchSeedboxFile, filesAuthHeaders } from './files';
export type { SeedboxFilesConfig } from './config';
