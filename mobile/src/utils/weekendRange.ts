// Computes the upcoming Saturday 00:00 through Sunday 23:59 window, in the
// device's local time. If `now` already falls on a Saturday or Sunday, the
// window starts today (today still counts as "this weekend").
export function getUpcomingWeekendRange(now: Date = new Date()): { dateFrom: string; dateTo: string } {
  const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day;

  const saturday = new Date(now);
  saturday.setDate(now.getDate() + daysUntilSaturday);
  saturday.setHours(0, 0, 0, 0);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);

  return { dateFrom: saturday.toISOString(), dateTo: sunday.toISOString() };
}
