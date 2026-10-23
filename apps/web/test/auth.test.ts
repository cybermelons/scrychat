import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK, type JWTVerifyGetKey } from "jose";
import { verifyAccessJwt, createRequireUser } from "../src/auth.js";

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-tag";
let getKey: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, o?: { iss?: string; aud?: string; exp?: string; key?: CryptoKey }) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  getKey = createLocalJWKSet({ keys: [jwk] });
  sign = async (claims, o = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(o.iss ?? `https://${TEAM}`)
      .setAudience(o.aud ?? AUD)
      .setExpirationTime(o.exp ?? "5m")
      .sign((o.key as CryptoKey) ?? privateKey);
});

describe("verifyAccessJwt", () => {
  it("returns the lowercased email as user id", async () => {
    const t = await sign({ email: "Bob@Example.com" });
    expect(await verifyAccessJwt(t, { team: TEAM, aud: AUD, getKey })).toBe("bob@example.com");
  });
  it("rejects wrong audience, issuer, expired, missing, garbage", async () => {
    const o = { team: TEAM, aud: AUD, getKey };
    expect(await verifyAccessJwt(await sign({ email: "a@b.c" }, { aud: "other" }), o)).toBeNull();
    expect(await verifyAccessJwt(await sign({ email: "a@b.c" }, { iss: "https://evil.example" }), o)).toBeNull();
    expect(await verifyAccessJwt(await sign({ email: "a@b.c" }, { exp: "-1m" }), o)).toBeNull();
    expect(await verifyAccessJwt(undefined, o)).toBeNull();
    expect(await verifyAccessJwt("not.a.jwt", o)).toBeNull();
  });
  it("rejects a token signed by another key", async () => {
    const other = await generateKeyPair("RS256");
    const t = await sign({ email: "a@b.c" }, { key: other.privateKey });
    expect(await verifyAccessJwt(t, { team: TEAM, aud: AUD, getKey })).toBeNull();
  });
  it("rejects a token with no usable email (service token)", async () => {
    expect(await verifyAccessJwt(await sign({}), { team: TEAM, aud: AUD, getKey })).toBeNull();
    expect(await verifyAccessJwt(await sign({ email: "../x" }), { team: TEAM, aud: AUD, getKey })).toBeNull();
  });
  it("fails closed when team or aud is unset", async () => {
    const t = await sign({ email: "a@b.c" });
    expect(await verifyAccessJwt(t, { aud: AUD, getKey })).toBeNull();
    expect(await verifyAccessJwt(t, { team: TEAM, getKey })).toBeNull();
  });
});

function run(mw: ReturnType<typeof createRequireUser>, headers: Record<string, string> = {}) {
  const req: any = { headers };
  const out: { status?: number; next: boolean } = { next: false };
  const res: any = { status: (n: number) => ((out.status = n), res), json: () => res };
  return (mw(req, res, () => (out.next = true)) as unknown as Promise<void>).then(() => ({ req, ...out }));
}

describe("createRequireUser", () => {
  it("401 with no config and no dev user (fail closed)", async () => {
    const r = await run(createRequireUser({}));
    expect(r.status).toBe(401);
    expect(r.next).toBe(false);
  });
  it("dev user passes only when team/aud unset", async () => {
    const r = await run(createRequireUser({ devUser: "Dev@Local.test" }));
    expect(r.next).toBe(true);
    expect(r.req.user).toBe("dev@local.test");
    const r2 = await run(createRequireUser({ devUser: "dev@local.test", team: TEAM, aud: AUD, getKey }));
    expect(r2.status).toBe(401);
  });
  it("valid header passes, forged email header does not", async () => {
    const mw = createRequireUser({ team: TEAM, aud: AUD, getKey });
    const ok = await run(mw, { "cf-access-jwt-assertion": await sign({ email: "a@b.c" }) });
    expect(ok.next).toBe(true);
    expect(ok.req.user).toBe("a@b.c");
    const forged = await run(mw, { "cf-access-authenticated-user-email": "a@b.c" });
    expect(forged.status).toBe(401);
  });
});
