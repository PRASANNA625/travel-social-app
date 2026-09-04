import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { useAuthStore } from "../store/authStore";
import { appendImageAsset } from "../utils/formDataImage";
import type { Trip, TravelMode, User } from "../types";

export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["users", "me"],
    queryFn: async () => (await apiClient.get<User>("/users/me")).data,
    enabled: !!token,
  });
}

export function useUser(userId?: string) {
  return useQuery({
    queryKey: ["users", userId],
    queryFn: async () => (await apiClient.get<User>(`/users/${userId}`)).data,
    enabled: !!userId,
  });
}

export function useCompletedTrips(userId?: string) {
  return useQuery({
    queryKey: ["users", userId, "completed-trips"],
    queryFn: async () => (await apiClient.get<Trip[]>(`/users/${userId}/completed-trips`)).data,
    enabled: !!userId,
  });
}

export interface ProfileUpdateInput {
  name?: string;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  interests?: string[];
  preferredModes?: TravelMode[];
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => (await apiClient.patch<User>("/users/me", input)).data,
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.setQueryData(["users", "me"], user);
    },
  });
}

export function useUploadProfilePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (asset: ImagePickerAsset) => {
      const form = new FormData();
      appendImageAsset(form, "photo", asset, "photo.jpg");
      const { data } = await apiClient.post<User>("/users/me/photo", form);
      return data;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.setQueryData(["users", "me"], user);
    },
  });
}

export function useUploadCoverPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (asset: ImagePickerAsset) => {
      const form = new FormData();
      appendImageAsset(form, "photo", asset, "cover.jpg");
      const { data } = await apiClient.post<User>("/users/me/cover-photo", form);
      return data;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.setQueryData(["users", "me"], user);
    },
  });
}
