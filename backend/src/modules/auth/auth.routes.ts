import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(controller.register));
authRouter.post("/login", asyncHandler(controller.login));
authRouter.post("/google", asyncHandler(controller.google));
authRouter.post("/phone/send-otp", asyncHandler(controller.sendOtp));
authRouter.post("/phone/verify-otp", asyncHandler(controller.verifyOtp));
