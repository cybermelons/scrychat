import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { userIdFromEmail } from "./users-core.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Sanitized user id (lowercased email), set by requireUser. */
      user?: string;
    }
  }
}

export interface AuthOptions {
  /** Cloudflare Access team domain, e.g. yeetst.cloudflareaccess.com */
  team?: string;
  /** Access application AUD tag */
  aud?: string;
  /**
   * LOCAL DEV ONLY. Skips JWT checks and treats every request as this email.
   * Honored only when team/aud are unset. Never set on the NAS.
   */
  devUser?: string;
  /** Key resolver; tests inject a local key. Defaults to the team's remote JWKS. */
  getKey?: JWTVerifyGetKey;
}

/** Verify a Cloudflare Access JWT. Returns the user id, or null for anything wrong. */
export async function verifyAccessJwt(
  token: string | undefined,
  opts: Pick<AuthOptions, "team" | "aud" | "getKey">,
): Promise<string | null> {
  if (!token || !opts.team || !opts.aud) return null;
  const getKey =
    opts.getKey ?? createRemoteJWKSet(new URL(`https://${opts.team}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: `https://${opts.team}`,
      audience: opts.aud,
    });
    return typeof payload.email === "string" ? userIdFromEmail(payload.email) : null;
  } catch {
    return null;
  }
}

/** Fails closed: without team+aud (or an explicit devUser) every request is 401. */
export function createRequireUser(opts: AuthOptions): RequestHandler {
  const configured = Boolean(opts.team && opts.aud);
  const dev = !configured && opts.devUser ? userIdFromEmail(opts.devUser) : null;
  // One shared remote JWKS (jose caches and rotates keys), not one per request.
  const getKey =
    opts.getKey ??
    (configured ? createRemoteJWKSet(new URL(`https://${opts.team}/cdn-cgi/access/certs`)) : undefined);
  return async (req: Request, res: Response, next: NextFunction) => {
    let user = dev;
    if (!user && configured) {
      const h = req.headers["cf-access-jwt-assertion"];
      user = await verifyAccessJwt(Array.isArray(h) ? h[0] : h, { team: opts.team, aud: opts.aud, getKey });
    }
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.user = user;
    next();
  };
}
