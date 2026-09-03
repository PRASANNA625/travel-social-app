import { prisma } from "../../config/prisma";
import { assertMember } from "../groups/groups.service";
import { parsePageParams, toSkipTake } from "../../utils/pagination";

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

  return { items: items.reverse(), total, ...pageParams };
}
