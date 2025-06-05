import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, Platform, ViewStyle, TextStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { CalendarSelector } from "./CalendarSelector";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { parseICalForPldSdvRequests, normalizeICalContent } from "@/utils/iCalParser";
import {
  ImportPreviewItem,
  createStagedImportPreview,
  StagedImportPreview,
  generateImportPreview,
} from "@/utils/importPreviewService";
import { StagedImportPreview as StagedImportPreviewComponent } from "./StagedImportPreview";
import { ImportPreviewComponent } from "./ImportPreviewComponent";
import Toast from "react-native-toast-message";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";

interface ImportPldSdvComponentProps {
  selectedDivision: string;
  selectedCalendarId: string | null | undefined;
  onCalendarChange?: (calendarId: string | null) => void;
}

export function ImportPldSdvComponent({
  selectedDivision,
  selectedCalendarId: propSelectedCalendarId,
  onCalendarChange,
}: ImportPldSdvComponentProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  // State for file handling
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  // State for preview and import
  const [stagedPreviewData, setStagedPreviewData] = useState<StagedImportPreview | null>(null);
  const [legacyPreviewData, setLegacyPreviewData] = useState<ImportPreviewItem[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [useStagedImport, setUseStagedImport] = useState(true); // Default to new staged import
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsingStatus, setParsingStatus] = useState<string>("");

  // Calendar management
  const { calendars } = useAdminCalendarManagementStore();
  const currentDivisionCalendars = calendars[selectedDivision] || [];
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(propSelectedCalendarId || null);

  // Update selectedCalendarId when prop changes
  useEffect(() => {
    setSelectedCalendarId(propSelectedCalendarId || null);
  }, [propSelectedCalendarId]);

  // Handle calendar selection
  const handleCalendarChange = useCallback(
    (calendarId: string | null) => {
      setSelectedCalendarId(calendarId);
      onCalendarChange?.(calendarId);
    },
    [onCalendarChange]
  );

  // This handles file selection using the FileReader API for browser
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    setFile(selectedFile);
    setFileContent(null);
    setStagedPreviewData(null);
    setLegacyPreviewData(null);
    setShowPreview(false);
    setError(null);

    if (selectedFile) {
      // Read the file content
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          if (content) {
            setFileContent(content);
          } else {
            setError("Could not read file content");
          }
        } catch (err) {
          console.error("Error reading file:", err);
          setError("Failed to read file content");
        }
      };
      reader.onerror = () => {
        setError("Error reading file");
      };
      reader.readAsText(selectedFile);
    }
  }, []);

  // Process the file content and generate preview
  const handlePreview = useCallback(async () => {
    if (!file || !fileContent || !selectedCalendarId) {
      setError("Please select both a file and a calendar before previewing");
      return;
    }

    setIsLoading(true);
    setError(null);
    setParsingStatus("Starting to process file...");

    // Setup console interception
    const originalConsoleLog = console.log;

    // Replace console.log to show matching progress
    console.log = function (...args) {
      originalConsoleLog.apply(console, args);

      // Only intercept during matching phase
      if (typeof args[0] === "string") {
        const message = args[0];

        // Updated patterns to match actual log messages from importPreviewService.ts
        if (message.includes("[ImportPreview] Processing request")) {
          // Extract the progress and name from messages like "[ImportPreview] Processing request 5/1358: John Smith"
          const progressMatch = message.match(/\[ImportPreview\] Processing request (\d+)\/(\d+): (.+)/);
          if (progressMatch) {
            const [, current, total, name] = progressMatch;
            setParsingStatus(`Processing member ${current} of ${total}: ${name}`);
          }
        } else if (message.includes("[MemberMatch] Searching for")) {
          // Extract the name being searched from messages like "[MemberMatch] Searching for "John Smith""
          const nameMatch = message.match(/\[MemberMatch\] Searching for "([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            setParsingStatus(`Looking up member: ${nameMatch[1]}`);
          }
        } else if (message.includes("[MemberMatch] Single") && message.includes("confidence match:")) {
          // Extract match results from messages like "[MemberMatch] Single high confidence match: John Smith (95%)"
          const matchResult = message.match(/\[MemberMatch\] Single .+ confidence match: (.+) \(/);
          if (matchResult && matchResult[1]) {
            setParsingStatus(`Found match: ${matchResult[1]}`);
          }
        } else if (message.includes("[MemberMatch] Using") && message.includes("match")) {
          // Extract match results from messages like "[MemberMatch] Using top match with significantly higher confidence: John Smith (87%)"
          const matchResult = message.match(/\[MemberMatch\] Using .+: (.+) \(/);
          if (matchResult && matchResult[1]) {
            setParsingStatus(`Matched: ${matchResult[1]}`);
          }
        } else if (message.includes("[MemberMatch] Multiple matches found")) {
          // Handle multiple matches scenario
          const nameMatch = message.match(/for "([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            setParsingStatus(`Multiple matches for: ${nameMatch[1]} (requires review)`);
          }
        } else if (message.includes("[MemberMatch] No matches found")) {
          // Handle no matches scenario
          const nameMatch = message.match(/for "([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            setParsingStatus(`No match found for: ${nameMatch[1]} (requires review)`);
          }
        } else if (message.includes("[ImportPreview] Complete -")) {
          // Handle final summary message
          const summaryMatch = message.match(/\[ImportPreview\] Complete - (\d+) items processed:/);
          if (summaryMatch && summaryMatch[1]) {
            setParsingStatus(`Completed processing ${summaryMatch[1]} requests - analyzing results...`);
          }
        } else if (message.includes("[StagedImport] Creating staged preview")) {
          // Handle staged import initialization
          const countMatch = message.match(/for (\d+) requests/);
          if (countMatch && countMatch[1]) {
            setParsingStatus(`Initializing staged import for ${countMatch[1]} requests...`);
          }
        } else if (message.includes("[StagedImport] Initialized with")) {
          // Handle staged import analysis results
          const unmatchedMatch = message.match(/with (\d+) unmatched items/);
          if (unmatchedMatch && unmatchedMatch[1]) {
            setParsingStatus(`Analysis complete - ${unmatchedMatch[1]} items need member assignment`);
          }
        }
      }
    };

    try {
      // Log the first few characters of the file content for debugging
      console.log("File content preview:", fileContent.substring(0, 100) + "...");

      // Normalize the iCal content
      setParsingStatus("Normalizing calendar data...");
      const normalizedContent = normalizeICalContent(fileContent);

      // Parse the iCal content to extract PLD/SDV requests for the target year
      console.log(`[ImportPldSdvComponent] Parsing iCal content for year ${year}...`);
      setParsingStatus(`Parsing calendar entries for ${year}...`);

      const parsedRequests = parseICalForPldSdvRequests(normalizedContent, year);

      if (parsedRequests.length === 0) {
        // Restore console.log
        console.log = originalConsoleLog;
        setError(`No valid PLD/SDV requests found for year ${year}. Check the file format and year.`);
        setIsLoading(false);
        return;
      }

      console.log(`[ImportPldSdvComponent] Found ${parsedRequests.length} requests in iCal file`);
      setParsingStatus(`Found ${parsedRequests.length} requests. Starting member matching...`);

      // Generate preview data with member matching and duplicate detection
      let divisionId: number | undefined;

      // Prioritize getting division_id from the selected calendar's details first
      if (selectedCalendarId) {
        const divisionCalendar = currentDivisionCalendars.find((cal: any) => cal.id === selectedCalendarId);
        if (divisionCalendar && typeof divisionCalendar.division_id === "number") {
          divisionId = divisionCalendar.division_id;
          console.log(`[ImportPldSdvComponent] Obtained divisionId ${divisionId} from selected calendar's details.`);
        } else {
          console.warn(
            `[ImportPldSdvComponent] Could not find division_id in selected calendar details, or it's not a number. Calendar ID: ${selectedCalendarId}`
          );
        }
      }

      // Fallback or alternative: if selectedDivision prop is a numeric string AND divisionId is still undefined
      if (divisionId === undefined && selectedDivision && /^\d+$/.test(selectedDivision)) {
        const parsedSelectedDivision = parseInt(selectedDivision, 10);
        divisionId = parsedSelectedDivision;
        console.log(`[ImportPldSdvComponent] Used selectedDivision prop as divisionId: ${divisionId} (fallback).`);
      }

      if (divisionId === undefined) {
        console.warn(
          `[ImportPldSdvComponent] divisionId is undefined. Member lookup will not be filtered by division.`
        );
      }

      console.log(
        `[ImportPldSdvComponent] Generating preview with divisionId: ${
          divisionId !== undefined ? divisionId : "undefined"
        }`,
        ` (selectedDivision: "${selectedDivision}", selectedCalendarId: "${selectedCalendarId}")`
      );

      // This will generate logs that our interceptor will catch to show matching progress
      if (useStagedImport) {
        const stagedPreview = await createStagedImportPreview(parsedRequests, selectedCalendarId, divisionId, year);

        // Restore console.log
        console.log = originalConsoleLog;

        console.log(
          `[ImportPldSdvComponent] Generated staged preview with ${stagedPreview.originalItems.length} items`
        );
        setParsingStatus(`Preview ready with ${stagedPreview.originalItems.length} items`);

        // Small delay to ensure the user sees the final status message before showing the preview
        await new Promise((resolve) => setTimeout(resolve, 500));

        setStagedPreviewData(stagedPreview);
        setLegacyPreviewData(null);
      } else {
        const previewItems = await generateImportPreview(parsedRequests, selectedCalendarId, divisionId);

        // Restore console.log
        console.log = originalConsoleLog;

        console.log(`[ImportPldSdvComponent] Generated legacy preview with ${previewItems.length} items`);
        setParsingStatus(`Preview ready with ${previewItems.length} items`);

        // Small delay to ensure the user sees the final status message before showing the preview
        await new Promise((resolve) => setTimeout(resolve, 500));

        setLegacyPreviewData(previewItems);
        setStagedPreviewData(null);
      }
      setShowPreview(true);
    } catch (err: any) {
      // Restore console.log in case of error
      console.log = originalConsoleLog;
      console.error("Error processing iCal file:", err);

      // Provide more detailed error message
      let errorMessage = "Failed to process iCal file";
      if (err.message) {
        errorMessage += `: ${err.message}`;
      }
      if (err.stack) {
        console.error("Stack trace:", err.stack);
      }
      setError(errorMessage);

      // If there's an error in file parsing, give specific guidance
      if (err.message?.includes("parse")) {
        setError(
          "The file format appears to be invalid. Please ensure it's a valid iCal (.ics) file exported from Google Calendar."
        );
      }
    } finally {
      // Always restore console.log in case it hasn't been restored yet
      console.log = originalConsoleLog;
      setIsLoading(false);
    }
  }, [file, fileContent, selectedCalendarId, year, selectedDivision, currentDivisionCalendars, useStagedImport]);

  // Handle import completion
  const handleImportComplete = useCallback((result: { success: boolean; count: number }) => {
    if (result.success) {
      Toast.show({
        type: "success",
        text1: "Import Successful",
        text2: `Successfully imported ${result.count} request${result.count !== 1 ? "s" : ""}`,
        position: "bottom",
      });
    }

    // Reset the state for a new import
    setFile(null);
    setFileContent(null);
    setStagedPreviewData(null);
    setLegacyPreviewData(null);
    setShowPreview(false);

    // Clear the file input by re-rendering it with a new key
    const fileInput = document.getElementById("ical-file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  }, []);

  // Render file upload UI
  const renderFileUpload = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>1. Select iCal File</ThemedText>

      {Platform.OS === "web" ? (
        <View style={styles.fileUploadContainer}>
          <input
            id="ical-file-input"
            type="file"
            accept=".ics"
            onChange={handleFileSelect}
            style={
              {
                padding: 10,
                backgroundColor: Colors[colorScheme].card,
                borderWidth: 1,
                borderColor: Colors[colorScheme].border,
                borderRadius: 8,
                color: Colors[colorScheme].text,
              } as React.CSSProperties
            }
          />
          {file && (
            <ThemedText style={styles.selectedFile}>
              Selected: {file.name} ({Math.round(file.size / 1024)} KB)
            </ThemedText>
          )}
        </View>
      ) : (
        <ThemedText style={styles.mobileNotice}>
          File upload is only available on web. Please use a desktop browser to import PLD/SDV data.
        </ThemedText>
      )}
    </View>
  );

  // Year selection UI
  const renderYearSelection = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>2. Select Target Year</ThemedText>
      <View style={styles.yearSelectorContainer}>
        <ThemedText style={styles.label}>Year for Import:</ThemedText>
        {Platform.OS === "web" ? (
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={
              {
                padding: 8,
                borderRadius: 4,
                fontSize: 16,
                backgroundColor: Colors[colorScheme].background,
                color: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].border,
                borderWidth: 1,
                width: 120,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : (
          <View style={styles.mobileYearDisplay}>
            <ThemedText>{year}</ThemedText>
          </View>
        )}
      </View>
    </View>
  );

  // Preview button
  const renderPreviewButton = () => (
    <View style={styles.section}>
      <Button
        onPress={handlePreview}
        disabled={!file || !selectedCalendarId || isLoading}
        variant="primary"
        style={styles.button}
      >
        {isLoading ? "Processing..." : "Preview Import"}
      </Button>
      {!selectedCalendarId && (
        <ThemedText style={styles.warning}>Please select a calendar before importing.</ThemedText>
      )}
    </View>
  );

  // Render import mode toggle
  const renderImportModeToggle = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Import Mode</ThemedText>
      <View style={styles.toggleContainer}>
        <ThemedTouchableOpacity
          style={[
            styles.toggleOption,
            { borderColor: Colors[colorScheme].border },
            useStagedImport && {
              backgroundColor: Colors[colorScheme].tint,
              borderColor: Colors[colorScheme].tint,
            },
          ]}
          onPress={() => setUseStagedImport(true)}
        >
          <Ionicons
            name="layers-outline"
            size={20}
            color={useStagedImport ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText style={[styles.toggleText, useStagedImport && { color: Colors[colorScheme].background }]}>
            Staged Import
          </ThemedText>
          <ThemedText
            style={[
              styles.toggleDescription,
              { color: useStagedImport ? Colors[colorScheme].background : Colors[colorScheme].textDim },
            ]}
          >
            Advanced workflow with over-allotment detection
          </ThemedText>
        </ThemedTouchableOpacity>

        <ThemedTouchableOpacity
          style={[
            styles.toggleOption,
            { borderColor: Colors[colorScheme].border },
            !useStagedImport && {
              backgroundColor: Colors[colorScheme].tint,
              borderColor: Colors[colorScheme].tint,
            },
          ]}
          onPress={() => setUseStagedImport(false)}
        >
          <Ionicons
            name="flash-outline"
            size={20}
            color={!useStagedImport ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText style={[styles.toggleText, !useStagedImport && { color: Colors[colorScheme].background }]}>
            Quick Import
          </ThemedText>
          <ThemedText
            style={[
              styles.toggleDescription,
              { color: !useStagedImport ? Colors[colorScheme].background : Colors[colorScheme].textDim },
            ]}
          >
            Simple review and import workflow
          </ThemedText>
        </ThemedTouchableOpacity>
      </View>
    </View>
  );

  // If showing preview, display the appropriate preview component
  if (showPreview && (stagedPreviewData || legacyPreviewData)) {
    if (useStagedImport && stagedPreviewData) {
      return (
        <StagedImportPreviewComponent
          stagedPreview={stagedPreviewData}
          onClose={() => setShowPreview(false)}
          onImportComplete={handleImportComplete}
        />
      );
    } else if (!useStagedImport && legacyPreviewData) {
      return (
        <ImportPreviewComponent
          previewData={legacyPreviewData}
          onClose={() => setShowPreview(false)}
          onImportComplete={handleImportComplete}
        />
      );
    }
  }

  // Main UI for file selection and setup
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={24} color={Colors[colorScheme].text} />
        <ThemedText style={styles.title}>Import PLD/SDV Requests from iCal</ThemedText>
      </View>

      <ThemedText style={styles.description}>
        Upload an iCal (.ics) file to import PLD/SDV requests. The system will extract dates, names, and leave types,
        then let you review before importing.
      </ThemedText>

      {/* Add CalendarSelector */}
      <CalendarSelector
        calendars={currentDivisionCalendars}
        selectedCalendarId={selectedCalendarId}
        onSelectCalendar={handleCalendarChange}
        disabled={isLoading}
        style={{ marginBottom: 16 }}
      />

      {renderImportModeToggle()}
      {renderFileUpload()}
      {renderYearSelection()}
      {renderPreviewButton()}

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <View style={styles.statusBox}>
            <ThemedText style={styles.parsingStatus}>{parsingStatus || "Processing..."}</ThemedText>
          </View>
        </View>
      )}

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  fileUploadContainer: {
    marginBottom: 8,
  },
  selectedFile: {
    fontSize: 14,
    marginTop: 8,
    fontStyle: "italic",
  },
  mobileNotice: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: 16,
  },
  yearSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  mobileYearDisplay: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
  },
  button: {
    marginTop: 8,
  },
  warning: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  loadingContainer: {
    alignItems: "center",
    marginTop: 20,
  },
  statusBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: "center",
  },
  parsingStatus: {
    fontSize: 14,
    textAlign: "center",
  },
  error: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 16,
  },
  previewContainer: {
    flex: 1,
    maxWidth: 500,
  },
  toggleContainer: {
    flexDirection: "row",
    gap: 12,
  },
  toggleOption: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
    textAlign: "center",
  },
  toggleDescription: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});
