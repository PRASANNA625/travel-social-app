import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, duringTokenSwap } from "./client";
import { disconnectSocket, reconnectSocket } from "./socket";
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
      // devCode is only ever present while phoneProvider.ts is the mock SMS
      // provider (no real SMS is sent yet) - see backend/auth.service.ts.
      const { data } = await apiClient.post<{ ok: true; devCode?: string }>("/auth/phone/send-otp", { phone });
      return data;
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

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => (await apiClient.post<{ ok: true }>("/auth/password/forgot", { email })).data,
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/password/reset", input);
      // The link may belong to a different account than the one signed in on this
      // browser: drop the previous account's cached data and chat connection.
      queryClient.clear();
      disconnectSocket();
      return completeLogin(data);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      duringTokenSwap(async () => {
        const { data } = await apiClient.post<{ token: string }>("/auth/password/change", input);
        await useAuthStore.getState().replaceToken(data.token);
        reconnectSocket();
        return data;
      }),
  });
}
