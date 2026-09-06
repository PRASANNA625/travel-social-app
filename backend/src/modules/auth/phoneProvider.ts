/**
 * Stubbed OTP provider. Swap the body of these two functions for a real
 * SMS provider (Twilio, MSG91, etc.) once credentials are available —
 * the rest of the auth flow doesn't need to change.
 */
interface PendingOtp {
  code: string;
  expiresAt: number;
}

const pendingOtps = new Map<string, PendingOtp>();
const OTP_TTL_MS = 5 * 60 * 1000;

// True for as long as this file is the mock implementation above. Flip this
// off (or delete it) the moment sendOtp actually calls a real SMS API - it
// exists solely to gate returning the raw code to the client for dev/testing.
export const isMockPhoneProvider = true;

export const phoneProvider = {
  async sendOtp(phone: string): Promise<string> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    pendingOtps.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });
    console.log(`[MockPhoneProvider] OTP for ${phone}: ${code}`);
    return code;
  },

  async checkOtp(phone: string, code: string): Promise<boolean> {
    const pending = pendingOtps.get(phone);
    if (!pending) return false;
    if (Date.now() > pending.expiresAt) {
      pendingOtps.delete(phone);
      return false;
    }
    return pending.code === code;
  },

  async consumeOtp(phone: string): Promise<void> {
    pendingOtps.delete(phone);
  },
};
