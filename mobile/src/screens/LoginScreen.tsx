import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useLogin } from "../api/auth";
import { Alert } from "../utils/alert";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();

  const onSubmit = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail) || !password) {
      Alert.alert("Check your details", "Enter a valid email address and your password.");
      return;
    }
    login.mutate(
      { email: trimmedEmail, password },
      { onError: (err: any) => Alert.alert("Login failed", err?.response?.data?.error ?? "Please try again") }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Travel & Social Meetup</Text>
      <Text style={styles.subtitle}>Find your next trip and your next travel crew.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword((v) => !v)}>
          <Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={login.isPending}>
        {login.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>New here? Create an account</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Google Sign-In and phone OTP are wired up on the backend — hook up expo-auth-session / your OTP UI here
        when you're ready to test them.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
  },
  passwordInput: { flex: 1, padding: 14, fontSize: 16 },
  passwordToggle: { paddingHorizontal: 14 },
  passwordToggleText: { color: "#0f766e", fontWeight: "600", fontSize: 14 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
  note: { color: "#999", fontSize: 12, textAlign: "center", marginTop: 32 },
});
