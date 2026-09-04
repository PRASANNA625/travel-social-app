import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useSendPhoneOtp, useVerifyPhoneOtp } from "../api/auth";
import { Alert } from "../utils/alert";

type Props = NativeStackScreenProps<AuthStackParamList, "PhoneLogin">;

type Step = "phone" | "code" | "name";

const NAME_REQUIRED_CODE = "NAME_REQUIRED";
const NAME_REQUIRED_ERROR = "Name is required to create an account";
const PHONE_REGEX = /^\+?\d{6,15}$/;

export function PhoneLoginScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const sendOtp = useSendPhoneOtp();
  const verifyOtp = useVerifyPhoneOtp();

  const onSendCode = () => {
    const trimmedPhone = phone.trim();
    if (!PHONE_REGEX.test(trimmedPhone)) {
      Alert.alert("Check your details", "Enter a valid phone number.");
      return;
    }
    sendOtp.mutate(trimmedPhone, {
      onSuccess: () => setStep("code"),
      onError: (err: any) => Alert.alert("Couldn't send code", err?.response?.data?.error ?? "Please try again"),
    });
  };

  const onVerify = (withName?: string) => {
    if (!code.trim()) {
      Alert.alert("Check your details", "Enter the code we sent you.");
      return;
    }
    verifyOtp.mutate(
      { phone: phone.trim(), code: code.trim(), name: withName },
      {
        onError: (err: any) => {
          const code = err?.response?.data?.code;
          const message = err?.response?.data?.error;
          if (code === NAME_REQUIRED_CODE || message === NAME_REQUIRED_ERROR) {
            setStep("name");
            return;
          }
          Alert.alert("Verification failed", message ?? "Please try again");
        },
      }
    );
  };

  const onSubmitName = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Check your details", "Enter your name.");
      return;
    }
    onVerify(trimmedName);
  };

  const isPending = sendOtp.isPending || verifyOtp.isPending;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log in with phone</Text>

      {step === "phone" && (
        <>
          <Text style={styles.subtitle}>We'll text you a one-time code.</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.button} onPress={onSendCode} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === "code" && (
        <>
          <Text style={styles.subtitle}>Enter the 6-digit code sent to {phone.trim()}.</Text>
          <TextInput
            style={styles.input}
            placeholder="Code"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TouchableOpacity style={styles.button} onPress={() => onVerify()} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSendCode} disabled={isPending}>
            <Text style={styles.link}>Resend code</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "name" && (
        <>
          <Text style={styles.subtitle}>This number is new to us — what's your name?</Text>
          <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
          <TouchableOpacity style={styles.button} onPress={onSubmitName} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
});
