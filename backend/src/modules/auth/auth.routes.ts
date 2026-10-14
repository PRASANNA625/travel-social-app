import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(controller.register));
authRouter.post("/login", asyncHandler(controller.login));
authRouter.post("/google", asyncHandler(controller.google));
// Phone (OTP) login is disabled: no real SMS provider is wired up, and the mock
// one hands the code back to the caller, so anyone could sign in as any number.
// Re-add the /phone/send-otp and /phone/verify-otp routes once phoneProvider.ts
// sends real SMS.
