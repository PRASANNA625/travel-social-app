// Standalone verification for groupNotificationsByAge - this repo has no unit-test
// framework, so this follows scripts/verify-weekend-range.ts.
// Run with: npx tsx mobile/scripts/verify-notification-groups.ts
import { groupNotificationsByAge } from "../src/utils/notificationGroups";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// Local time, so day boundaries follow the phone's time zone.
const now = new Date(2026, 9, 19, 0, 30); // 19 Oct 2026, 00:30 - just after midnight
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();
const n = (id: string, createdAt: string, read = true) => ({ id, createdAt, read });

const items = [
  n("today-midnight", at(2026, 9, 19, 0, 5), false),
  n("yesterday-late", at(2026, 9, 18, 23, 50), false), // 40 minutes ago, but yesterday
  n("yesterday-early", at(2026, 9, 18, 0, 1)),
  n("three-days", at(2026, 9, 16)),
  n("seven-days", at(2026, 9, 12, 0, 1)), // start of the 7-day window
  n("eight-days", at(2026, 9, 11, 23, 59), false), // just outside it
  n("twenty-days", at(2026, 8, 29)),
  n("thirty-days", at(2026, 8, 19, 0, 1)), // start of the 30-day window
  n("sixty-days", at(2026, 7, 20)),
];

const sections = groupNotificationsByAge(items, now);
const ids = (key: string) => sections.find((s) => s.key === key)?.data.map((x) => x.id) ?? [];

assert(sections.map((s) => s.key).join(",") === "today,yesterday,week,month,earlier", `section order ${sections.map((s) => s.key)}`);
assert(sections.map((s) => s.title).join(",") === "Today,Yesterday,This week,This month,Earlier", "section titles");
assert(ids("today").join() === "today-midnight", `today ${ids("today")}`);
assert(ids("yesterday").join() === "yesterday-late,yesterday-early", `yesterday ${ids("yesterday")}`);
assert(ids("week").join() === "three-days,seven-days", `week ${ids("week")}`);
assert(ids("month").join() === "eight-days,twenty-days,thirty-days", `month ${ids("month")}`);
assert(ids("earlier").join() === "sixty-days", `earlier ${ids("earlier")}`);

// Unread counts per section.
const unread = Object.fromEntries(sections.map((s) => [s.key, s.unread]));
assert(unread.today === 1 && unread.yesterday === 1 && unread.week === 0 && unread.month === 1 && unread.earlier === 0, `unread ${JSON.stringify(unread)}`);

// Empty sections are left out; order inside a section is kept as given (newest first).
const sparse = groupNotificationsByAge([n("a", at(2026, 9, 19, 0, 10)), n("b", at(2026, 6, 1))], now);
assert(sparse.map((s) => s.key).join(",") === "today,earlier", `sparse ${sparse.map((s) => s.key)}`);
assert(groupNotificationsByAge([], now).length === 0, "no notifications, no sections");

// A clock slightly behind the server: a timestamp a little in the future still counts as today.
assert(groupNotificationsByAge([n("future", at(2026, 9, 19, 0, 32))], now)[0].key === "today", "future timestamp is today");

console.log("verify-notification-groups: all assertions passed");
