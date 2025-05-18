import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Calendar from "expo-calendar";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { Alert } from "react-native";

/**
 * Adds a meeting to the device calendar (for iOS and Android)
 * @param title Meeting title
 * @param startDate Start date of the meeting
 * @param endDate End date of the meeting
 * @param location Location of the meeting
 * @param notes Any additional notes or details
 */
export async function addToDeviceCalendar(
    title: string,
    startDate: Date,
    endDate: Date,
    location: string,
    notes: string,
): Promise<boolean> {
    try {
        // Check and request calendar permissions
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(
                "Permission Required",
                "Calendar permission is required to add events to your calendar",
            );
            return false;
        }

        // Get available calendars
        const calendars = await Calendar.getCalendarsAsync(
            Calendar.EntityTypes.EVENT,
        );
        if (!calendars || calendars.length === 0) {
            Alert.alert("No Calendars", "No calendars found on this device");
            return false;
        }

        // Get default calendar - use the first available writable calendar
        const defaultCalendar = calendars.find((cal) =>
            cal.allowsModifications
        ) || calendars[0];

        // Create the event
        const eventId = await Calendar.createEventAsync(defaultCalendar.id, {
            title,
            startDate,
            endDate,
            location,
            notes,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            alarms: [{ relativeOffset: -60 }], // Alert 1 hour before meeting
        });

        Alert.alert("Success", "Meeting added to your calendar");
        return true;
    } catch (error) {
        console.error("Error adding event to calendar:", error);
        Alert.alert("Error", "Failed to add meeting to calendar");
        return false;
    }
}

/**
 * Exports an ICS file for web platforms
 * @param icsContent The iCalendar data string
 * @param filename The name of the file to save
 */
export async function exportIcsFile(
    icsContent: string,
    filename: string = "meeting.ics",
): Promise<boolean> {
    try {
        // Generate the file path in temp directory
        const filePath = `${FileSystem.cacheDirectory}${filename}`;

        // Write the ICS content to the file
        await FileSystem.writeAsStringAsync(filePath, icsContent, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        // On web, create a download link
        if (Platform.OS === "web") {
            // Create a blob and download link
            const blob = new Blob([icsContent], { type: "text/calendar" });
            const url = URL.createObjectURL(blob);

            // Create and trigger download link
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();

            // Clean up
            URL.revokeObjectURL(url);
            return true;
        } // On mobile, share the file
        else if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(filePath, {
                mimeType: "text/calendar",
                dialogTitle: "Save Meeting to Calendar",
                UTI: "public.calendar",
            });
            return true;
        }

        return false;
    } catch (error) {
        console.error("Error exporting ICS file:", error);
        Alert.alert("Error", "Failed to export calendar file");
        return false;
    }
}

/**
 * Handle calendar export based on platform
 * @param icsContent The iCalendar data string
 * @param meeting The meeting object with title, dates, location
 * @returns Promise<boolean> Success flag
 */
export async function handleCalendarExport(
    icsContent: string,
    meeting: {
        title: string;
        startDate: Date;
        endDate: Date;
        location: string;
        notes: string;
    },
): Promise<boolean> {
    try {
        if (Platform.OS === "web") {
            // For web, export as ICS file
            return await exportIcsFile(
                icsContent,
                `${meeting.title.replace(/\s+/g, "-")}.ics`,
            );
        } else if (Platform.OS === "ios" || Platform.OS === "android") {
            // For mobile, give the user the choice between adding directly or exporting
            return new Promise((resolve) => {
                Alert.alert(
                    "Add to Calendar",
                    "How would you like to add this meeting to your calendar?",
                    [
                        {
                            text: "Add Directly",
                            onPress: async () => {
                                const result = await addToDeviceCalendar(
                                    meeting.title,
                                    meeting.startDate,
                                    meeting.endDate,
                                    meeting.location,
                                    meeting.notes,
                                );
                                resolve(result);
                            },
                        },
                        {
                            text: "Export as File",
                            onPress: async () => {
                                const result = await exportIcsFile(icsContent);
                                resolve(result);
                            },
                        },
                        {
                            text: "Cancel",
                            style: "cancel",
                            onPress: () => resolve(false),
                        },
                    ],
                );
            });
        }

        return false;
    } catch (error) {
        console.error("Error handling calendar export:", error);
        return false;
    }
}
