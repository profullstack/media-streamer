import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rules that make several seedboxes on one account safe.
 *
 * These are the parts that fail quietly rather than loudly: an id from another
 * account resolving to that account's box, or a delete leaving an account with
 * boxes but no default — after which every "send to seedbox" silently lands on a
 * different machine than it did the day before.
 *
 * The store below is an in-memory stand-in for the handful of PostgREST calls
 * this module makes, so the logic is exercised without a database.
 */

interface Row {
  id: string;
  account_id: string;
  name: string | null;
  is_default: boolean;
  created_at: string;
  [key: string]: unknown;
}

let rows: Row[] = [];
let seq = 0;

/** Enough of the query builder to run this module, and nothing more. */
function makeClient() {
  return {
    from() {
      const filters: { col: string; val: unknown; negate?: boolean }[] = [];
      const orders: { col: string; asc: boolean }[] = [];
      let limitN: number | null = null;

      const matching = (): Row[] => {
        let out = rows.filter((r) =>
          filters.every((f) => (f.negate ? r[f.col] !== f.val : r[f.col] === f.val)),
        );
        for (const o of [...orders].reverse()) {
          out = [...out].sort((a, b) => {
            const av = a[o.col];
            const bv = b[o.col];
            if (av === bv) return 0;
            const cmp = av! > bv! ? 1 : -1;
            return o.asc ? cmp : -cmp;
          });
        }
        return limitN == null ? out : out.slice(0, limitN);
      };

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return builder;
        },
        neq(col: string, val: unknown) {
          filters.push({ col, val, negate: true });
          return builder;
        },
        order(col: string, opts: { ascending: boolean }) {
          orders.push({ col, asc: opts.ascending });
          return builder;
        },
        limit(n: number) {
          limitN = n;
          return builder;
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        single: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: matching(), error: null }),
        insert(record: Record<string, unknown>) {
          seq += 1;
          const row: Row = {
            id: `box-${seq}`,
            account_id: String(record.account_id),
            name: (record.name as string | null) ?? null,
            is_default: Boolean(record.is_default),
            created_at: new Date(2026, 0, seq).toISOString(),
            ...record,
          } as Row;
          row.id = `box-${seq}`;
          rows.push(row);
          return {
            select: () => ({ single: async () => ({ data: row, error: null }) }),
          };
        },
        update(patch: Record<string, unknown>) {
          const apply = { ...builder } as Record<string, unknown>;
          apply.eq = (col: string, val: unknown) => {
            filters.push({ col, val });
            return apply;
          };
          apply.neq = (col: string, val: unknown) => {
            filters.push({ col, val, negate: true });
            return apply;
          };
          apply.then = (resolve: (v: { error: null }) => unknown) => {
            for (const r of matching()) Object.assign(r, patch);
            return resolve({ error: null });
          };
          return apply;
        },
        delete() {
          const del = {} as Record<string, unknown>;
          del.eq = (col: string, val: unknown) => {
            filters.push({ col, val });
            return del;
          };
          del.then = (resolve: (v: { error: null }) => unknown) => {
            const doomed = new Set(matching().map((r) => r.id));
            rows = rows.filter((r) => !doomed.has(r.id));
            return resolve({ error: null });
          };
          return del;
        },
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase', () => ({ createServerClient: () => makeClient() }));
vi.mock('./crypto', () => ({
  encryptOptional: (v: string | null) => v,
  decryptOptional: (v: string | null) => v,
}));

import {
  createSeedbox,
  deleteSeedbox,
  getSeedboxConfigSummary,
  listSeedboxes,
  setDefaultSeedbox,
} from './account-config';

const ACCOUNT = 'acct-1';
const OTHER = 'acct-2';

beforeEach(() => {
  rows = [];
  seq = 0;
});

describe('several seedboxes on one account', () => {
  it('makes the first box the default and later ones not', async () => {
    const first = await createSeedbox(ACCOUNT, { name: 'Box one' });
    const second = await createSeedbox(ACCOUNT, { name: 'Box two' });

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(await listSeedboxes(ACCOUNT)).toHaveLength(2);
  });

  it('keeps each account to its own boxes', async () => {
    const mine = await createSeedbox(ACCOUNT, { name: 'Mine' });
    await createSeedbox(OTHER, { name: 'Theirs' });

    expect(await listSeedboxes(ACCOUNT)).toHaveLength(1);
    // Asking for my box as the other account must not find it.
    const leaked = await getSeedboxConfigSummary(OTHER, mine.id as string);
    expect(leaked.id).toBeNull();
  });

  it('moves the default rather than allowing two', async () => {
    const first = await createSeedbox(ACCOUNT, { name: 'One' });
    const second = await createSeedbox(ACCOUNT, { name: 'Two' });

    await setDefaultSeedbox(ACCOUNT, second.id as string);

    const list = await listSeedboxes(ACCOUNT);
    expect(list.filter((b) => b.isDefault)).toHaveLength(1);
    expect(list.find((b) => b.id === second.id)?.isDefault).toBe(true);
    expect(list.find((b) => b.id === first.id)?.isDefault).toBe(false);
  });

  it('promotes a successor when the default is deleted', async () => {
    const first = await createSeedbox(ACCOUNT, { name: 'One' });
    await createSeedbox(ACCOUNT, { name: 'Two' });

    await deleteSeedbox(ACCOUNT, first.id as string);

    const list = await listSeedboxes(ACCOUNT);
    expect(list).toHaveLength(1);
    // Without this the account has a seedbox but no default, and everything that
    // does not name one starts resolving by accident.
    expect(list[0].isDefault).toBe(true);
  });

  it('leaves the default alone when a non-default is deleted', async () => {
    const first = await createSeedbox(ACCOUNT, { name: 'One' });
    const second = await createSeedbox(ACCOUNT, { name: 'Two' });

    await deleteSeedbox(ACCOUNT, second.id as string);

    const list = await listSeedboxes(ACCOUNT);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(first.id);
    expect(list[0].isDefault).toBe(true);
  });

  it('refuses to delete another account’s box', async () => {
    const mine = await createSeedbox(ACCOUNT, { name: 'Mine' });

    await deleteSeedbox(OTHER, mine.id as string);

    expect(await listSeedboxes(ACCOUNT)).toHaveLength(1);
  });
});
