import type { TravelMode } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";

export const publicUserSelect = {
  id: true,
  name: true,
  photoUrl: true,
  coverPhotoUrl: true,
  age: true,
  location: true,
  bio: true,
  interests: true,
  preferredModes: true,
  email: true,
  phone: true,
  phoneVerified: true,
  createdAt: true,
} as const;

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

export interface ProfileUpdateInput {
  name?: string;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  interests?: string[];
  preferredModes?: TravelMode[];
}

export async function updateProfile(userId: string, data: ProfileUpdateInput) {
  return prisma.user.update({ where: { id: userId }, data, select: publicUserSelect });
}

export async function setPhoto(userId: string, photoUrl: string) {
  return prisma.user.update({ where: { id: userId }, data: { photoUrl }, select: publicUserSelect });
}

export async function setCoverPhoto(userId: string, coverPhotoUrl: string) {
  return prisma.user.update({ where: { id: userId }, data: { coverPhotoUrl }, select: publicUserSelect });
}

export async function getCompletedTrips(userId: string) {
  return prisma.trip.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ ownerId: userId }, { joinRequests: { some: { userId, status: "APPROVED" } } }],
    },
    orderBy: { startDate: "desc" },
  });
}
