// Standalone verification for getUpcomingWeekendRange - this repo has no
// unit-test framework, so this mirrors backend/scripts/smoke-test.mjs's
// homegrown assert() convention. Run with: npx tsx mobile/scripts/verify-weekend-range.ts
import { getUpcomingWeekendRange } from "../src/utils/weekendRange";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function dayName(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
}

// Monday -> should jump forward to the coming Saturday/Sunday.
const monday = new Date("2026-09-14T10:00:00"); // a Monday
const fromMonday = getUpcomingWeekendRange(monday);
assert(dayName(fromMonday.dateFrom) === "Saturday", `expected Saturday, got ${dayName(fromMonday.dateFrom)}`);
assert(dayName(fromMonday.dateTo) === "Sunday", `expected Sunday, got ${dayName(fromMonday.dateTo)}`);
assert(new Date(fromMonday.dateFrom) > monday, "Saturday should be after Monday");

// Sunday -> should keep today (Sunday) as the start of the window, not jump a full week ahead.
const sunday = new Date("2026-09-13T10:00:00"); // a Sunday
const fromSunday = getUpcomingWeekendRange(sunday);
assert(dayName(fromSunday.dateTo) === "Sunday", `expected Sunday, got ${dayName(fromSunday.dateTo)}`);
assert(
  new Date(fromSunday.dateTo).toDateString() === sunday.toDateString(),
  "the Sunday window should end on today when today is already Sunday"
);

// Saturday -> should keep today as the start.
const saturday = new Date("2026-09-12T10:00:00"); // a Saturday
const fromSaturday = getUpcomingWeekendRange(saturday);
assert(
  new Date(fromSaturday.dateFrom).toDateString() === saturday.toDateString(),
  "the Saturday window should start today when today is already Saturday"
);

console.log("✓ getUpcomingWeekendRange: Monday jumps to the coming weekend");
console.log("✓ getUpcomingWeekendRange: Sunday keeps today in range");
console.log("✓ getUpcomingWeekendRange: Saturday keeps today in range");
console.log("All weekendRange checks passed.");
