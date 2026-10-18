import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./auth.controller";
import { requireAuth } from "../../middleware/auth";
import { devOutboxEnabled, readDevOutbox } from "../../utils/mailer";
import { resetRateLimits } from "../../utils/rateLimit";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(controller.register));
authRouter.post("/login", asyncHandler(controller.login));
authRouter.post("/google", asyncHandler(controller.google));
// Phone (OTP) login is disabled: no real SMS provider is wired up, and the mock
// one hands the code back to the caller, so anyone could sign in as any number.
// Re-add the /phone/send-otp and /phone/verify-otp routes once phoneProvider.ts
// sends real SMS.

authRouter.post("/password/forgot", asyncHandler(controller.forgotPassword));
authRouter.post("/password/reset", asyncHandler(controller.resetPassword));
authRouter.post("/password/change", requireAuth, asyncHandler(controller.changePassword));

// Local testing only (DEV_MAIL_INBOX=1, never in production): read sent emails, clear rate limits.
if (devOutboxEnabled) {
  authRouter.get("/dev/outbox", (req, res) => res.json(readDevOutbox(String(req.query.to ?? ""))));
  authRouter.post("/dev/reset-limits", (_req, res) => {
    resetRateLimits();
    res.json({ ok: true });
  });
}
