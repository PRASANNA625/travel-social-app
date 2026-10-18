// Splits a newest-first notification list into age sections for the Notifications
// screen. Day boundaries are local midnight, so "Today" means the user's today.
export type AgeSectionKey = "today" | "yesterday" | "week" | "month" | "earlier";

export interface AgeSection<T> {
  key: AgeSectionKey;
  title: string;
  unread: number;
  data: T[];
}

const SECTIONS: { key: AgeSectionKey; title: string; daysBack: number }[] = [
  { key: "today", title: "Today", daysBack: 0 },
  { key: "yesterday", title: "Yesterday", daysBack: 1 },
  { key: "week", title: "This week", daysBack: 7 },
  { key: "month", title: "This month", daysBack: 30 },
];

function midnightDaysAgo(now: Date, days: number) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();
}

export function groupNotificationsByAge<T extends { createdAt: string; read: boolean }>(items: T[], now = new Date()): AgeSection<T>[] {
  const starts = SECTIONS.map((s) => midnightDaysAgo(now, s.daysBack));
  const sections: AgeSection<T>[] = [...SECTIONS, { key: "earlier" as const, title: "Earlier", daysBack: Infinity }].map((s) => ({
    key: s.key,
    title: s.title,
    unread: 0,
    data: [],
  }));
  for (const item of items) {
    const time = new Date(item.createdAt).getTime();
    const index = starts.findIndex((start) => time >= start);
    const section = sections[index === -1 ? sections.length - 1 : index];
    section.data.push(item);
    if (!item.read) section.unread++;
  }
  return sections.filter((s) => s.data.length > 0);
}
