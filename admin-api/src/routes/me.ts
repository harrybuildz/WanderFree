// Who am I? The SPA calls this right after sign-in to decide whether the
// account is actually allowed in — a valid Supabase session is not enough.

import { Router } from "express";

import { requireAdmin } from "../auth.js";

export const meRouter = Router();

meRouter.get("/", requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});
