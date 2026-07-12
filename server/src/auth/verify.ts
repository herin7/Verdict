import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "../config.js";

export interface AuthUser {
  id: string;
  email?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!config.supabaseJwtIssuer) {
    throw new Error("SUPABASE_JWT_ISSUER is not set");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${config.supabaseJwtIssuer.replace(/\/$/, "")}/.well-known/jwks.json`)
    );
  }
  return jwks;
}

/**
 * Most Supabase projects still sign access tokens with the legacy shared HS256
 * "JWT Secret" - only projects that opted into the newer asymmetric signing keys
 * publish a JWKS. Try JWKS first (preferred, no shared secret needed), and fall
 * back to HS256 with SUPABASE_JWT_SECRET so auth doesn't silently fail on
 * default/legacy projects.
 */
export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const issuer = config.supabaseJwtIssuer.replace(/\/$/, "");

  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer });
    return claimsToUser(payload);
  } catch (jwksErr) {
    if (!config.supabaseJwtSecret) throw jwksErr;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.supabaseJwtSecret), {
      algorithms: ["HS256"],
      issuer,
    });
    return claimsToUser(payload);
  }
}

function claimsToUser(payload: JWTPayload): AuthUser {
  const id = typeof payload.sub === "string" ? payload.sub : null;
  if (!id) throw new Error("JWT missing sub");
  const email = typeof payload.email === "string" ? payload.email : undefined;
  return { id, email };
}
