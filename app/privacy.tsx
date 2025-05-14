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

        <ThemedText style={styles.lastUpdated}>Last Updated: May 24, 2024</ThemedText>
        <ThemedText style={styles.lastUpdated} onPress={() => Linking.openURL("https://www.bletcnwcgca.org/privacy")}>
          https://www.bletcnwcgca.org/privacy
        </ThemedText>

        <ThemedText style={styles.sectionTitle}>Introduction</ThemedText>
        <ThemedText style={styles.paragraph}>
          This privacy policy explains how the BLET PLD App collects, uses, and protects your information when you use
          our mobile application. We are committed to protecting your privacy and ensuring the security of your personal
          information.
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

        <ThemedText style={styles.subSectionTitle}>Mobile Phone Number</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • If you opt in to receive SMS notifications, we collect and store your mobile phone number.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Your mobile phone number is used SOLELY for sending you the notifications you have explicitly requested.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We DO NOT sell, rent, lease, or share your mobile phone number with any third parties or affiliates for
            marketing or promotional purposes.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Your mobile phone number is only shared with Twilio, our SMS service provider, for the sole purpose of
            delivering the notifications you have requested.
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
          <ThemedText style={styles.bulletItem}>
            • We DO NOT use your mobile phone number or any other personal information for marketing purposes beyond
            what you have explicitly consented to.
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
          <ThemedText style={styles.bulletItem}>
            • Your mobile phone number is stored securely and is accessible only to authorized personnel who need it to
            provide the services you have requested.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Notification Preferences</ThemedText>
        <ThemedText style={styles.paragraph}>
          Our app provides multiple ways to receive notifications. You can choose your preferred communication method in
          your profile settings. All notification methods require explicit opt-in consent.
        </ThemedText>

        <ThemedText style={styles.subSectionTitle}>In-App Notifications</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • By default, notifications are only shown when using the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • No personal information is shared with third parties for in-app notifications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You can view all your notifications in the notifications section of the app.
          </ThemedText>
        </View>

        <ThemedText style={styles.subSectionTitle}>SMS Notifications</ThemedText>
        <ThemedText style={styles.paragraph}>
          If you opt in to receive SMS notifications, the following applies:
        </ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We will send SMS notifications for important app updates, alerts, request approvals/denials, waitlist
            position changes, meeting notices, and other important union communications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Message frequency varies, typically 5-10 messages per month, but may be more frequent during busy periods
            or important events.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Message and data rates may apply based on your wireless carrier plan. No additional fees are charged by
            our service.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You can opt out at any time by replying STOP to any message or by changing your contact preference in the
            app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • When you opt in to receive SMS notifications through the app, we collect your phone number and store it
            securely.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We use Twilio as our SMS service provider, which has its own{" "}
            <ThemedText
              style={{ color: "#b8860b" }}
              onPress={() => Linking.openURL("https://www.twilio.com/legal/privacy")}
            >
              privacy policy
            </ThemedText>{" "}
            available at twilio.com.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Your mobile phone number will NEVER be sold, rented, or shared with third parties for marketing or
            promotional purposes.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We only use your mobile phone number to send you the specific notifications you have requested.
          </ThemedText>
        </View>

        <ThemedText style={styles.subSectionTitle}>Email Notifications</ThemedText>
        <ThemedText style={styles.paragraph}>
          If you opt in to receive Email notifications, the following applies:
        </ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We will send email notifications for important app updates, alerts, request approvals/denials, waitlist
            position changes, meeting notices, and other important union communications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Email frequency varies, typically 5-10 emails per month, but may be more frequent during busy periods or
            important events.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Emails will be sent from notifications@bletcnwcgca.org using our email service provider, Resend.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You can opt out at any time by clicking the unsubscribe link in any email or by changing your contact
            preference in the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • All emails comply with the CAN-SPAM Act and include our physical mailing address and unsubscribe options.
          </ThemedText>
        </View>

        <ThemedText style={styles.subSectionTitle}>Push Notifications</ThemedText>
        <ThemedText style={styles.paragraph}>
          If you opt in to receive Push notifications, the following applies:
        </ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We will send push notifications for important app updates, alerts, request approvals/denials, waitlist
            position changes, meeting notices, and other important union communications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Push notification frequency varies, typically 5-10 notifications per month, but may be more frequent
            during busy periods or important events.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Push notifications require granting notification permissions to this app on your device.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You can opt out at any time by changing your device notification settings or by changing your contact
            preference in the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We use Expo's push notification service to deliver notifications to your device.
          </ThemedText>
        </View>

        <ThemedText style={styles.subSectionTitle}>SMS Opt-In Verification</ThemedText>
        <ThemedText style={styles.paragraph}>
          When users opt for SMS notifications, they are presented with a clear opt-in confirmation dialog that explains
          the type of messages, frequency, rates, and opt-out options as shown below:
        </ThemedText>

        <View style={styles.imageContainer}>
          <ThemedText style={styles.imageCaption}>SMS Opt-In Dialog (Part 1)</ThemedText>
          <Image
            source={require("@/assets/images/Opt_in_Notice_1.png")}
            style={styles.screenshotImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.imageContainer}>
          <ThemedText style={styles.imageCaption}>SMS Opt-In Dialog (Part 2)</ThemedText>
          <Image
            source={require("@/assets/images/Opt_in_Notice_2.png")}
            style={styles.screenshotImage}
            resizeMode="contain"
          />
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
          <ThemedText style={styles.bulletItem}>
            • We use Twilio for SMS communications if you opt in to text notifications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We use Resend as our email service provider for sending email notifications.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We DO NOT share your mobile phone number or other personal information with these third-party services for
            marketing or promotional purposes.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Third-party services only receive the information necessary to provide the specific services you have
            requested.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Data Sharing Practices</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We DO NOT sell, rent, lease, or share your mobile phone number or other personal information with any
            third parties or affiliates for marketing or promotional purposes.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • Your mobile phone number is only shared with Twilio, our SMS service provider, for the sole purpose of
            delivering the SMS notifications you have explicitly requested.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We may share anonymized, aggregated data that does not identify you personally for analytical purposes.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • We may disclose your information if required by law or to protect our rights or the rights of others.
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
          <ThemedText style={styles.bulletItem}>
            • You have the right to opt out of SMS notifications at any time by replying STOP to any message or changing
            your preferences in the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • You have the right to access, correct, or delete your personal information by contacting us using the
            information below.
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Changes to This Policy</ThemedText>
        <View style={styles.bulletContainer}>
          <ThemedText style={styles.bulletItem}>
            • We may update this privacy policy periodically. Significant changes will be notified within the app.
          </ThemedText>
          <ThemedText style={styles.bulletItem}>
            • The latest version will always be available within the app and on our website at
            https://www.bletcnwcgca.org/privacy.
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
              • Email: admin@bletcnwcgca.org
            </ThemedText>
            <ThemedText style={styles.bulletItem}>
              • Mail: GCA 910 Privacy Officer, 404 4th St, Fond du Lac, WI 54935
            </ThemedText>
            <ThemedText style={styles.bulletItem}>• Website: https://www.bletcnwcgca.org/privacy</ThemedText>
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
  imageContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  imageCaption: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 5,
  },
  screenshotImage: {
    width: 300,
    height: 400,
  },
});
