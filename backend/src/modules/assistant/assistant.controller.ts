import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import { assistantRequestSchema } from "./assistant.types";
import { getAssistantReply } from "./assistant.service";

export async function sendMessage(req: AuthedRequest, res: Response) {
  const { messages } = assistantRequestSchema.parse(req.body);
  const reply = await getAssistantReply(req.userId!, messages);
  res.json(reply);
}
