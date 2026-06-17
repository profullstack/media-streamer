export const SEEDBOX_RESOURCE_STATUSES = [
  // Keep in sync with the seedbox_resources.status enum in the seedbox reseller PRD.
  'pending',
  'provisioning',
  'active',
  'suspended',
  'terminating',
  'terminated',
  'failed',
] as const;

export type SeedboxResourceStatus = (typeof SEEDBOX_RESOURCE_STATUSES)[number];
export type SeedboxResourceKind = 'managed' | 'byos';
export type SeedboxProvider = 'digitalocean' | 'reseller' | null;

export interface SeedboxResource {
  id: string;
  userId: string;
  kind: SeedboxResourceKind;
  provider: SeedboxProvider;
  providerRef: string | null;
  plan: string | null;
  status: SeedboxResourceStatus;
  host: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  terminatedAt: Date | null;
  metadata: Record<string, unknown>;
}

export const SEEDBOX_TERMINAL_STATUSES = ['terminated'] as const satisfies readonly SeedboxResourceStatus[];

const ALLOWED_TRANSITIONS = {
  pending: ['provisioning', 'failed', 'terminating'],
  provisioning: ['active', 'failed', 'terminating'],
  active: ['suspended', 'terminating', 'failed'],
  suspended: ['active', 'terminating', 'failed'],
  terminating: ['terminated', 'failed'],
  terminated: [],
  failed: ['provisioning', 'terminating'],
} as const satisfies Record<SeedboxResourceStatus, readonly SeedboxResourceStatus[]>;

export function getAllowedSeedboxStatusTargets(
  status: SeedboxResourceStatus
): SeedboxResourceStatus[] {
  return [...ALLOWED_TRANSITIONS[status]];
}

export function isSeedboxTerminalStatus(status: SeedboxResourceStatus): boolean {
  return SEEDBOX_TERMINAL_STATUSES.includes(status as (typeof SEEDBOX_TERMINAL_STATUSES)[number]);
}

export function canTransitionSeedboxStatus(
  from: SeedboxResourceStatus,
  to: SeedboxResourceStatus
): boolean {
  const targets: readonly SeedboxResourceStatus[] = ALLOWED_TRANSITIONS[from];
  return targets.includes(to);
}

export function requireSeedboxStatusTransition(
  from: SeedboxResourceStatus,
  to: SeedboxResourceStatus
): void {
  if (!canTransitionSeedboxStatus(from, to)) {
    throw new Error(`Invalid seedbox lifecycle transition: ${from} -> ${to}`);
  }
}

export function transitionSeedboxResource(
  resource: SeedboxResource,
  nextStatus: SeedboxResourceStatus,
  now = new Date()
): SeedboxResource {
  requireSeedboxStatusTransition(resource.status, nextStatus);

  return {
    ...resource,
    status: nextStatus,
    activatedAt:
      nextStatus === 'active' && resource.activatedAt == null ? now : resource.activatedAt,
    terminatedAt: nextStatus === 'terminated' ? now : resource.terminatedAt,
  };
}
