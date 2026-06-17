import { describe, expect, it } from 'vitest';
import {
  SEEDBOX_TERMINAL_STATUSES,
  canTransitionSeedboxStatus,
  getAllowedSeedboxStatusTargets,
  isSeedboxTerminalStatus,
  requireSeedboxStatusTransition,
  transitionSeedboxResource,
  type SeedboxResource,
} from './lifecycle';

function resource(status: SeedboxResource['status']): SeedboxResource {
  return {
    id: 'resource-1',
    userId: 'user-1',
    kind: 'managed',
    provider: 'digitalocean',
    providerRef: 'droplet-1',
    plan: 'starter',
    status,
    host: null,
    createdAt: new Date('2026-06-15T00:00:00.000Z'),
    activatedAt: null,
    terminatedAt: null,
    metadata: {},
  };
}

describe('seedbox lifecycle', () => {
  it('allows the managed seedbox happy path from order to teardown', () => {
    expect(canTransitionSeedboxStatus('pending', 'provisioning')).toBe(true);
    expect(canTransitionSeedboxStatus('provisioning', 'active')).toBe(true);
    expect(canTransitionSeedboxStatus('active', 'suspended')).toBe(true);
    expect(canTransitionSeedboxStatus('suspended', 'active')).toBe(true);
    expect(canTransitionSeedboxStatus('active', 'terminating')).toBe(true);
    expect(canTransitionSeedboxStatus('terminating', 'terminated')).toBe(true);
  });

  it('rejects skipped or backwards lifecycle jumps', () => {
    expect(canTransitionSeedboxStatus('pending', 'active')).toBe(false);
    expect(canTransitionSeedboxStatus('provisioning', 'suspended')).toBe(false);
    expect(canTransitionSeedboxStatus('terminating', 'active')).toBe(false);
  });

  it('keeps terminal states final', () => {
    expect(SEEDBOX_TERMINAL_STATUSES).toEqual(['terminated']);
    expect(isSeedboxTerminalStatus('terminated')).toBe(true);
    expect(getAllowedSeedboxStatusTargets('terminated')).toEqual([]);
    expect(canTransitionSeedboxStatus('terminated', 'active')).toBe(false);
  });

  it('allows failed resources to retry provisioning or proceed to teardown', () => {
    expect(getAllowedSeedboxStatusTargets('failed')).toEqual(['provisioning', 'terminating']);
    expect(canTransitionSeedboxStatus('failed', 'provisioning')).toBe(true);
    expect(canTransitionSeedboxStatus('failed', 'terminating')).toBe(true);
    expect(canTransitionSeedboxStatus('failed', 'active')).toBe(false);
  });

  it('throws a descriptive error for invalid transitions', () => {
    expect(() => requireSeedboxStatusTransition('pending', 'active')).toThrow(
      'Invalid seedbox lifecycle transition: pending -> active'
    );
  });

  it('stamps activation and termination timestamps when transitioning resources', () => {
    const now = new Date('2026-06-16T12:00:00.000Z');
    const activated = transitionSeedboxResource(resource('provisioning'), 'active', now);
    const terminated = transitionSeedboxResource(resource('terminating'), 'terminated', now);

    expect(activated.status).toBe('active');
    expect(activated.activatedAt).toEqual(now);
    expect(activated.terminatedAt).toBeNull();
    expect(terminated.status).toBe('terminated');
    expect(terminated.terminatedAt).toEqual(now);
  });
});
