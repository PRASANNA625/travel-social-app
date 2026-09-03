import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useRegister } from "../api/auth";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();

  const onSubmit = () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      Alert.alert("Check your details", "Name, email, and an 8+ character password are required.");
      return;
    }
    register.mutate(
      { name: name.trim(), email: email.trim().toLowerCase(), password },
      { onError: (err: any) => Alert.alert("Sign up failed", err?.response?.data?.error ?? "Please try again") }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={register.isPending}>
        {register.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
});
