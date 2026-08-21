// Two independent gates in front of the service-role key.
//
//   1. The bearer token must be a currently-valid Supabase Auth session. We
//      verify it against the Auth server rather than decoding it locally, so a
//      signed-out or revoked session stops working immediately.
//   2. The verified email must have an active row in public.admin_users.
//
// Gate 1 alone is not admin access: every WanderFreely beta user has a valid
// session. Gate 2 alone is not either — the allowlist is only consulted for an
// identity the Auth server vouched for.

import type { NextFunction, Request, Response } from "express";

import { forbidden, unauthorized } from "./lib/errors.js";
import { admin, verify } from "./supabase.js";

export interface AdminActor {
  id: string;
  email: string;
  displayName: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminActor;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized("Missing bearer token.");

    // Gate 1 — is this a real, live session?
    const { data, error } = await verify.auth.getUser(token);
    if (error || !data.user) throw unauthorized("Session is invalid or expired.");

    const email = data.user.email?.toLowerCase().trim();
    if (!email) throw forbidden("This account has no email address.");

    // Gate 2 — is this person allowed in? Uses the service-role client because
    // admin_users has RLS on with no policies; nothing else can read it.
    const { data: row, error: allowErr } = await admin
      .from("admin_users")
      .select("email, display_name, is_active")
      .eq("email", email)
      .maybeSingle();
    if (allowErr) throw allowErr;

    if (!row) {
      throw forbidden(
        `${email} is not on the admin allowlist. Add a row to public.admin_users in Supabase Studio.`,
      );
    }
    if (!row.is_active) {
      throw forbidden(`Admin access for ${email} has been deactivated.`);
    }

    req.admin = {
      id: data.user.id,
      email,
      displayName: (row.display_name as string | null) ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
}
