import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { appendImageAsset } from "../utils/formDataImage";

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: {
      kind: "REPORT" | "FEEDBACK";
      type: string;
      description: string;
      screenshot?: ImagePickerAsset;
    }) => {
      const form = new FormData();
      form.append("kind", input.kind);
      form.append("type", input.type);
      form.append("description", input.description);
      form.append("appVersion", Constants.expoConfig?.version ?? "unknown");
      form.append("platform", Platform.OS);
      if (input.screenshot) {
        appendImageAsset(form, "screenshot", input.screenshot, "feedback.jpg");
      }
      const { data } = await apiClient.post("/feedback", form);
      return data as { id: string; kind: string; type: string; status: string; createdAt: string };
    },
  });
}
