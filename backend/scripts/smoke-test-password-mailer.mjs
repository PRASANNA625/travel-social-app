// Dev outbox wiring: the endpoints exist only with DEV_MAIL_INBOX=1 outside production.
import { request, check, report, resetLimits } from "./lib/http.mjs";

const outbox = await request("GET", "/auth/dev/outbox?to=nobody@triply.test");
check("dev outbox endpoint answers", outbox.status === 200 && Array.isArray(outbox.data), `status ${outbox.status}`);
const reset = await resetLimits();
check("dev reset-limits endpoint answers", reset.status === 200 && reset.data?.ok === true, `status ${reset.status}`);
report();
