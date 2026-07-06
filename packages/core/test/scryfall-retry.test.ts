import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setRetryConfigForTests, scryfallFetch, ScryfallError } from "../src/scryfall.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("scryfallFetch retry (stubbed fetch, no network)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Tiny backoff + instant sleep so retry tests run fast.
    __setRetryConfigForTests({ backoffMs: [1, 1, 1, 1], sleep: () => Promise.resolve() });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    __setRetryConfigForTests(null);
    vi.restoreAllMocks();
  });

  it("retries on 429 and delivers the result once a 200 arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await scryfallFetch<{ ok: boolean }>("/cards/named?fuzzy=test");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("respects a Retry-After header when present", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    __setRetryConfigForTests({ backoffMs: [1, 1, 1, 1], sleep });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await scryfallFetch<{ ok: boolean }>("/cards/named?fuzzy=test");

    expect(result).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("throws the typed ScryfallError after exhausting retries on persistent 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "rate limited" }, 429));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(scryfallFetch("/cards/named?fuzzy=test")).rejects.toThrow(ScryfallError);
    // Initial attempt + MAX_RETRIES(4) retries = 5 calls total.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("retries on 503 the same way as 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await scryfallFetch<{ ok: boolean }>("/cards/named?fuzzy=test");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still returns null for 404 without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "not found" }, 404));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await scryfallFetch("/cards/named?fuzzy=nope");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws immediately (no retry) for other non-200 statuses like 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "server error" }, 500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(scryfallFetch("/cards/named?fuzzy=test")).rejects.toThrow(ScryfallError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
