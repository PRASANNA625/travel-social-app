import { prisma } from "../../config/prisma";
import { assertMember } from "../groups/groups.service";
import { parsePageParams, toSkipTake } from "../../utils/pagination";

// Copy this array verbatim wherever the allowed-reactions list is needed
// elsewhere (e.g. the mobile ReactionPickerModal) - these six emoji include
// invisible variation-selector codepoints, so retyping them risks a
// byte-mismatch that silently breaks equality checks.
export const ALLOWED_REACTIONS = ["❤️", "👍", "😂", "😍", "😮", "🙌"] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageReadEntry {
  userId: string;
  readAt: string;
}

function groupReactionRows(
  rows: { messageId: string; userId: string; emoji: string }[]
): Map<string, MessageReactionSummary[]> {
  const byMessage = new Map<string, Map<string, MessageReactionSummary>>();
  for (const row of rows) {
    let byEmoji = byMessage.get(row.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      byMessage.set(row.messageId, byEmoji);
    }
    const existing = byEmoji.get(row.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(row.userId);
    } else {
      byEmoji.set(row.emoji, { emoji: row.emoji, count: 1, userIds: [row.userId] });
    }
  }
  const result = new Map<string, MessageReactionSummary[]>();
  for (const [messageId, byEmoji] of byMessage) {
    result.set(messageId, Array.from(byEmoji.values()));
  }
  return result;
}

export async function getReactionsForMessage(messageId: string): Promise<MessageReactionSummary[]> {
  const rows = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { messageId: true, userId: true, emoji: true },
  });
  return groupReactionRows(rows).get(messageId) ?? [];
}

// Batch-fetches MessageRead rows for a set of messages and groups them by
// messageId. Used both by listMessages (a whole page of messages at once)
// and by socket.ts's message:read handler (the set of messages touched by
// one incoming read-event, already grouped by sender before this is called) -
// a single query either way, never one query per message.
export async function getReadsForMessages(messageIds: string[]): Promise<Map<string, MessageReadEntry[]>> {
  const rows = await prisma.messageRead.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true, userId: true, readAt: true },
  });
  const map = new Map<string, MessageReadEntry[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push({ userId: row.userId, readAt: row.readAt.toISOString() });
    map.set(row.messageId, list);
  }
  return map;
}

export async function listMessages(groupId: string, userId: string, query: Record<string, unknown>) {
  await assertMember(groupId, userId);
  const pageParams = parsePageParams(query, 30, 100);

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { groupId },
      include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
    }),
    prisma.message.count({ where: { groupId } }),
  ]);

  const messageIds = items.map((m) => m.id);
  const [reactionRows, readsByMessageId] = await Promise.all([
    prisma.messageReaction.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true, userId: true, emoji: true },
    }),
    getReadsForMessages(messageIds),
  ]);
  const reactionsByMessage = groupReactionRows(reactionRows);

  const itemsWithExtras = items.map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) ?? [],
    readBy: message.senderId === userId ? readsByMessageId.get(message.id) ?? [] : undefined,
  }));

  return { items: itemsWithExtras.reverse(), total, ...pageParams };
}
