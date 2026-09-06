import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { appendImageAsset } from "../utils/formDataImage";
import type { JoinType, Paginated, Trip, TripComment, TravelMode } from "../types";

export interface TripFilters {
  search?: string;
  destination?: string;
  travelMode?: TravelMode[];
  dateFrom?: string;
  dateTo?: string;
  budgetMin?: number;
  budgetMax?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sortOrder?: "asc" | "desc";
  page?: number;
}

export function useTrips(filters: TripFilters) {
  return useQuery({
    queryKey: ["trips", filters],
    queryFn: async () => {
      const params = { ...filters, travelMode: filters.travelMode?.length ? filters.travelMode.join(",") : undefined };
      return (await apiClient.get<Paginated<Trip>>("/trips", { params })).data;
    },
  });
}

export function useTrip(tripId?: string) {
  return useQuery({
    queryKey: ["trips", tripId],
    queryFn: async () => (await apiClient.get<Trip>(`/trips/${tripId}`)).data,
    enabled: !!tripId,
  });
}

export function useMyTrips() {
  return useQuery({
    queryKey: ["trips", "mine"],
    queryFn: async () => (await apiClient.get<Trip[]>("/trips/mine")).data,
  });
}

export function useBookmarkedTrips() {
  return useQuery({
    queryKey: ["trips", "bookmarked"],
    queryFn: async () => (await apiClient.get<Trip[]>("/trips/bookmarked")).data,
  });
}

export interface CreateTripInput {
  title: string;
  destination: string;
  startLocation: string;
  startLat?: number | null;
  startLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  startDate: string;
  endDate: string;
  travelMode: TravelMode;
  budget?: number;
  seats: number;
  description: string;
  placesToVisit: string[];
  groupSizeExpected?: number;
  images: string[];
  notes?: string;
  joinType: JoinType;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTripInput) => (await apiClient.post<Trip>("/trips", input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useUploadTripImages() {
  return useMutation({
    mutationFn: async (assets: ImagePickerAsset[]) => {
      const form = new FormData();
      assets.forEach((asset, i) => {
        appendImageAsset(form, "images", asset, `trip-${i}.jpg`);
      });
      const { data } = await apiClient.post<{ urls: string[] }>("/trips/images", form);
      return data.urls;
    },
  });
}

function useTripMutation<TInput = void>(fn: (tripId: string, input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, input }: { tripId: string; input: TInput }) => fn(tripId, input),
    onSuccess: (_data, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
    },
  });
}

export function useUpdateTripImages() {
  return useTripMutation((tripId, images: string[]) => apiClient.patch(`/trips/${tripId}`, { images }));
}

export type UpdateTripInput = Partial<Omit<CreateTripInput, "images">>;

export function useUpdateTrip() {
  return useTripMutation((tripId, input: UpdateTripInput) => apiClient.patch(`/trips/${tripId}`, input));
}

export function useLikeTrip() {
  return useTripMutation((tripId, like: boolean) =>
    like ? apiClient.post(`/trips/${tripId}/like`) : apiClient.delete(`/trips/${tripId}/like`)
  );
}

export function useBookmarkTrip() {
  return useTripMutation((tripId, bookmark: boolean) =>
    bookmark ? apiClient.post(`/trips/${tripId}/bookmark`) : apiClient.delete(`/trips/${tripId}/bookmark`)
  );
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => apiClient.delete(`/trips/${tripId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useTripComments(tripId?: string) {
  return useQuery({
    queryKey: ["trips", tripId, "comments"],
    queryFn: async () => (await apiClient.get<TripComment[]>(`/trips/${tripId}/comments`)).data,
    enabled: !!tripId,
  });
}

export function useAddComment(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) =>
      (await apiClient.post<TripComment>(`/trips/${tripId}/comments`, { text })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips", tripId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
    },
  });
}
