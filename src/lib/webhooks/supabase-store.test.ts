// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { Delivery, Endpoint } from "@profullstack/webhooks";
import { supabaseStore, HUB_TABLES } from "./supabase-store";
import { fakeSupabase } from "./__fixtures__/fake-supabase";

const endpoint = (over: Partial<Endpoint> = {}): Endpoint => ({
  id: "wh_1",
  owner: "user-1",
  url: "https://hooks.example.com/",
  secret: "whsec_abc=",
  events: ["gig.*"],
  description: "",
  enabled: true,
  failures: 0,
  disabledReason: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: "dlv_1",
  endpointId: "wh_1",
  owner: "user-1",
  eventId: "ev_1",
  eventType: "gig.update",
  payload: "{}",
  status: "pending",
  attempts: 0,
  nextAt: 5000,
  lastStatus: null,
  lastError: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

describe("supabaseStore", () => {
  it("round-trips endpoints through the hub_ table columns", async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    await store.insertEndpoint(endpoint());
    expect(sb.rows(HUB_TABLES.endpoints)[0]).toMatchObject({ events: '["gig.*"]', enabled: 1, disabled_reason: null, created_at: 1000 });
    expect(await store.getEndpoint("wh_1")).toEqual(endpoint());
    expect(await store.getEndpoint("nope")).toBeNull();

    await store.updateEndpoint("wh_1", { enabled: false, failures: 3, disabledReason: "off", events: ["*"], updatedAt: 2000 });
    expect(await store.getEndpoint("wh_1")).toMatchObject({ enabled: false, failures: 3, disabledReason: "off", events: ["*"], updatedAt: 2000 });

    await store.insertEndpoint(endpoint({ id: "wh_2", createdAt: 500 }));
    await store.insertEndpoint(endpoint({ id: "wh_3", owner: "user-2" }));
    expect((await store.listEndpoints("user-1")).map((e) => e.id)).toEqual(["wh_2", "wh_1"]);
  });

  it("claims due deliveries once and leases them", async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    await store.insertDeliveries([delivery(), delivery({ id: "dlv_2", nextAt: 9000 }), delivery({ id: "dlv_3", status: "delivered", nextAt: 0 })]);
    const first = await store.claimDue(6000, 10, 60_000);
    expect(first.map((d) => d.id)).toEqual(["dlv_1"]);
    expect(await store.claimDue(6000, 10, 60_000)).toEqual([]);
    expect((await store.getDelivery("dlv_1"))!.nextAt).toBe(66_000);
  });

  it("lists, updates, prunes and deletes deliveries", async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    await store.insertEndpoint(endpoint());
    await store.insertDeliveries([
      delivery({ id: "a", createdAt: 1 }),
      delivery({ id: "b", createdAt: 2, endpointId: "wh_other" }),
      delivery({ id: "c", createdAt: 3, owner: "user-2" }),
    ]);
    expect((await store.listDeliveries({ owner: "user-1" })).map((d) => d.id)).toEqual(["b", "a"]);
    expect((await store.listDeliveries({ owner: "user-1", endpointId: "wh_1" })).map((d) => d.id)).toEqual(["a"]);
    expect((await store.listDeliveries({ owner: "user-1", limit: 1 })).map((d) => d.id)).toEqual(["b"]);

    await store.updateDelivery("a", { status: "delivered", attempts: 1, lastStatus: 200, updatedAt: 10 });
    expect(await store.getDelivery("a")).toMatchObject({ status: "delivered", attempts: 1, lastStatus: 200 });

    await store.prune(100);
    expect((await store.listDeliveries({ owner: "user-1" })).map((d) => d.id)).toEqual(["b"]);

    await store.insertDeliveries([delivery({ id: "d" })]);
    await store.deleteEndpoint("wh_1");
    expect(await store.getEndpoint("wh_1")).toBeNull();
    expect(await store.getDelivery("d")).toBeNull();
    expect(await store.getDelivery("b")).not.toBeNull();
  });

  it("throws the Supabase error message instead of losing a write", async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    await store.insertEndpoint(endpoint());
    await expect(store.insertEndpoint(endpoint())).rejects.toThrow(/insert endpoint: duplicate key/);
  });
});
