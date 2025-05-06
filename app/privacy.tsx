import React from "react";
import { StyleSheet, View, ScrollView, Image, Linking } from "react-native";
import { Stack } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";

export default function PrivacyPolicyScreen() {
  const theme = useColorScheme() ?? "dark";

  const goldPrimary = "#d4af37";
  const goldSecondary = "#aa8c2c";
  const goldAccent = "#b8860b";
  const darkGray = "#1a1a1a";

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: "Privacy Policy",
          headerShown: true,
        }}
      />

      <ScrollView style={styles.container}>
        <View style={styles.logoContainer}>
          <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} resizeMode="contain" />
        </View>

        <ThemedText style={styles.title}>Privacy Policy for BLET PLD App</ThemedText>

        <ThemedText style={styles.lastUpdated}>Last Updated: May 5, 2025</ThemedText>
        <ThemedText style={styles.lastUpdated} onPress={() => Linking.openURL("https://www.bletcnwcgca.org/privacy")}>
          https://www.bletcnwcgca.org/privacy
        </ThemedText>

        <ThemedText style={styles.sectionTitle}>Introduction</ThemedText>
        <ThemedText style={styles.paragraph}>
          This privacy policy explains how the BLET PLD App collects, uses, and protects your information when you use
          our mobile application.
        </ThemedText>

        <ThemedText style={styles.sectionTitle}>Information We Collect</ThemedText>

        <ThemedText style={styles.subSectionTitle}>Photo Gallery Access</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We request access to your device's photo gallery to allow you (as an Admin user) to select images for
            advertisements to upload to the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We only access photos that you explicitly select through the system's photo picker.
          </ThemedText>
        </View>

        <ThemedText style={styles.subSectionTitle}>Camera Access</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • Our app may request camera access to allow you to take photos directly within the app for creating
            advertisements or other content.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Any photos taken using our app are stored on your device and are not automatically transmitted to our
            servers unless you explicitly upload them.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>How We Use Information</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • Photos are only used for the specific purposes shown in the app, such as creating and displaying
            advertisements.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We do not collect, store, or transmit your photos to external servers without your knowledge and explicit
            action.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Your usage data may be collected anonymously to improve the app experience.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Data Storage and Security</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • User content primarily remains on your device unless you explicitly choose to share it through the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • When data is transmitted to our servers (such as when you create advertisements), we implement security
            measures to protect your information.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We use Supabase for our backend services, which maintains high security standards for data storage and
            transmission.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Third-Party Services</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>• We use Firebase for app analytics and notifications.</ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Our app integrates with Expo services for updates and functionality.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • These services may collect anonymous usage data according to their respective privacy policies.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>User Rights</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • You can choose not to grant photo or camera permissions, though this may limit some app functionality.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You can request information about your data or request deletion by contacting us.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Changes to This Policy</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We may update this privacy policy periodically. Significant changes will be notified within the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • The latest version will always be available within the app and on our website.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Contact Us</ThemedText>
        <View style={[styles.contactInfo, { backgroundColor: darkGray, borderColor: goldSecondary }]}>
          <ThemedText style={styles.paragraph}>
            If you have questions about this privacy policy or our data practices, please contact us at:
          </ThemedText>
          <View style={styles.bulletContainer}>
            <ThemedText
              style={[styles.bulletItem, { color: goldAccent }]}
              onPress={() => Linking.openURL("mailto:privacy@bletcnwcgca.org")}
            >
              • Email: privacy@bletcnwcgca.org
            </ThemedText>
            <ThemedText style={styles.bulletItem}>
              • Mail: GCA 910 Privacy Officer, 404 4th St, Fond du Lac, WI 54935
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.dark.background,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  logo: {
    width: 150,
    height: 150,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#aa8c2c",
  },
  lastUpdated: {
    fontStyle: "italic",
    color: "#aa8c2c",
    textAlign: "center",
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 25,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#aa8c2c",
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 5,
  },
  paragraph: {
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  bulletContainer: {
    marginLeft: 5,
    marginBottom: 15,
  },
  bulletItem: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  contactInfo: {
    padding: 15,
    borderRadius: 5,
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
  },
});
