import type { Delivery, Endpoint, WebhookStore } from "@profullstack/webhooks";

/**
 * A @profullstack/webhooks store on supabase-js.
 *
 * ugig has no direct Postgres connection string (only the Supabase URL and the
 * service role key), so the package's postgresStore cannot be used. This keeps
 * the same two tables (schemaSql('pg', 'hub_'), see the
 * 20261028150000_webhooks_hub migration) and the same claim semantics: due
 * rows are taken with FOR UPDATE SKIP LOCKED inside the
 * claim_hub_webhook_deliveries RPC, because PostgREST cannot lock rows.
 *
 * Times are unix milliseconds (BIGINT); `events` is JSON text; `enabled` is 0/1.
 */

type Row = Record<string, unknown>;
type Result<T = unknown> = { data: T | null; error: { message: string } | null };

/** The slice of a supabase-js client this store needs (any client works; tests pass a fake). */
export interface SupabaseLike {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result<Row[]>>;
}

export const HUB_TABLES = {
  endpoints: "hub_webhook_endpoints",
  deliveries: "hub_webhook_deliveries",
  claim: "claim_hub_webhook_deliveries",
} as const;

const ENDPOINT_FIELDS: Record<string, string> = {
  url: "url",
  secret: "secret",
  events: "events",
  description: "description",
  enabled: "enabled",
  failures: "failures",
  disabledReason: "disabled_reason",
  updatedAt: "updated_at",
};

const DELIVERY_FIELDS: Record<string, string> = {
  status: "status",
  attempts: "attempts",
  nextAt: "next_at",
  lastStatus: "last_status",
  lastError: "last_error",
  updatedAt: "updated_at",
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function check<T>(r: Result<T>, what: string): T | null {
  if (r.error) throw new Error(`webhooks store: ${what}: ${r.error.message}`);
  return r.data;
}

export function toEndpoint(r: Row | null | undefined): Endpoint | null {
  if (!r) return null;
  let events: string[] = ["*"];
  try {
    const parsed = typeof r.events === "string" ? JSON.parse(r.events) : r.events;
    if (Array.isArray(parsed)) events = parsed.map(String);
  } catch {
    // keep ["*"]
  }
  return {
    id: String(r.id),
    owner: String(r.owner),
    url: String(r.url),
    secret: String(r.secret),
    events,
    description: (r.description as string) ?? "",
    enabled: Number(r.enabled) === 1 || r.enabled === true,
    failures: Number(r.failures ?? 0),
    disabledReason: (r.disabled_reason as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function toDelivery(r: Row | null | undefined): Delivery | null {
  if (!r) return null;
  return {
    id: String(r.id),
    endpointId: String(r.endpoint_id),
    owner: String(r.owner),
    eventId: String(r.event_id),
    eventType: String(r.event_type),
    payload: String(r.payload),
    status: r.status as Delivery["status"],
    attempts: Number(r.attempts ?? 0),
    nextAt: Number(r.next_at),
    lastStatus: num(r.last_status),
    lastError: (r.last_error as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function sqlValue(key: string, value: unknown) {
  if (key === "events") return JSON.stringify(value);
  if (key === "enabled") return value ? 1 : 0;
  return value ?? null;
}

function columns(fields: Record<string, string>, patch: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (fields[k] && v !== undefined) out[fields[k]] = sqlValue(k, v);
  }
  return out;
}

const endpointRow = (e: Endpoint): Row => ({
  id: e.id,
  owner: e.owner,
  url: e.url,
  secret: e.secret,
  events: JSON.stringify(e.events),
  description: e.description,
  enabled: e.enabled ? 1 : 0,
  failures: e.failures,
  disabled_reason: e.disabledReason,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

const deliveryRow = (d: Delivery): Row => ({
  id: d.id,
  endpoint_id: d.endpointId,
  owner: d.owner,
  event_id: d.eventId,
  event_type: d.eventType,
  payload: d.payload,
  status: d.status,
  attempts: d.attempts,
  next_at: d.nextAt,
  last_status: d.lastStatus,
  last_error: d.lastError,
  created_at: d.createdAt,
  updated_at: d.updatedAt,
});

export function supabaseStore(client: SupabaseLike): WebhookStore {
  const T = HUB_TABLES;
  return {
    async insertEndpoint(e) {
      check(await client.from(T.endpoints).insert(endpointRow(e)), "insert endpoint");
    },
    async getEndpoint(id) {
      return toEndpoint(check<Row>(await client.from(T.endpoints).select("*").eq("id", id).maybeSingle(), "get endpoint"));
    },
    async listEndpoints(owner) {
      const rows = check<Row[]>(
        await client.from(T.endpoints).select("*").eq("owner", owner).order("created_at", { ascending: true }),
        "list endpoints",
      );
      return (rows ?? []).map((r) => toEndpoint(r) as Endpoint);
    },
    async updateEndpoint(id, patch) {
      const set = columns(ENDPOINT_FIELDS, patch as Record<string, unknown>);
      if (!Object.keys(set).length) return;
      check(await client.from(T.endpoints).update(set).eq("id", id), "update endpoint");
    },
    async deleteEndpoint(id) {
      check(await client.from(T.deliveries).delete().eq("endpoint_id", id), "delete deliveries");
      check(await client.from(T.endpoints).delete().eq("id", id), "delete endpoint");
    },
    async insertDeliveries(rows) {
      if (!rows.length) return;
      check(await client.from(T.deliveries).insert(rows.map(deliveryRow)), "insert deliveries");
    },
    async getDelivery(id) {
      return toDelivery(check<Row>(await client.from(T.deliveries).select("*").eq("id", id).maybeSingle(), "get delivery"));
    },
    async listDeliveries({ owner, endpointId, limit = 50 }) {
      let q = client.from(T.deliveries).select("*").eq("owner", owner);
      if (endpointId) q = q.eq("endpoint_id", endpointId);
      const rows = check<Row[]>(await q.order("created_at", { ascending: false }).limit(limit), "list deliveries");
      return (rows ?? []).map((r) => toDelivery(r) as Delivery);
    },
    async updateDelivery(id, patch) {
      const set = columns(DELIVERY_FIELDS, patch as Record<string, unknown>);
      if (!Object.keys(set).length) return;
      check(await client.from(T.deliveries).update(set).eq("id", id), "update delivery");
    },
    async claimDue(now, limit, leaseMs) {
      const rows = check<Row[]>(
        await client.rpc(T.claim, { p_now: now, p_limit: limit, p_lease_until: now + leaseMs }),
        "claim due",
      );
      return (rows ?? []).map((r) => toDelivery(r) as Delivery);
    },
    async prune(before) {
      check(
        await client.from(T.deliveries).delete().neq("status", "pending").lt("updated_at", before),
        "prune",
      );
    },
  };
}
