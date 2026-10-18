import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { AuthStack } from "./AuthStack";
import { AppNavigator } from "./AppNavigator";
import { clearResetToken, takeResetToken } from "./resetLink";
import { ResetPasswordScreen } from "../screens/ResetPasswordScreen";

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  // A reset link wins over everything else until it's finished or cancelled.
  const [resetToken, setResetToken] = useState(takeResetToken);
  const [openForgot, setOpenForgot] = useState(false);
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onClose={(requestNew) => {
          clearResetToken();
          setResetToken(null);
          if (requestNew) {
            useAuthStore.getState().logout();
            setOpenForgot(true);
          }
        }}
      />
    );
  }
  return token ? <AppNavigator /> : <AuthStack initialRouteName={openForgot ? "ForgotPassword" : undefined} />;
}
