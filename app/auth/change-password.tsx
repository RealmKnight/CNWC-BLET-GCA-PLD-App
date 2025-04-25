import { Redirect } from "expo-router";

export default function ChangePasswordRedirect() {
  // Redirect to the actual change password page
  return <Redirect href="/(auth)/change-password" />;
}
