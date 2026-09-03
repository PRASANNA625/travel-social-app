import { useMutation } from "@tanstack/react-query";
import { apiClient } from "./client";
import { useAuthStore } from "../store/authStore";
import type { User } from "../types";

interface AuthResponse {
  token: string;
  user: User;
}

async function completeLogin(response: AuthResponse) {
  await useAuthStore.getState().login(response.token, response.user);
  return response;
}

export function useRegister() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string; name: string }) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/register", input);
      return completeLogin(data);
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/login", input);
      return completeLogin(data);
    },
  });
}

export function useGoogleLogin() {
  return useMutation({
    mutationFn: async (idToken: string) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/google", { idToken });
      return completeLogin(data);
    },
  });
}

export function useSendPhoneOtp() {
  return useMutation({
    mutationFn: async (phone: string) => {
      await apiClient.post("/auth/phone/send-otp", { phone });
    },
  });
}

export function useVerifyPhoneOtp() {
  return useMutation({
    mutationFn: async (input: { phone: string; code: string; name?: string }) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/phone/verify-otp", input);
      return completeLogin(data);
    },
  });
}
