import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert, Modal } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import {
  StagedImportPreview as StagedImportPreviewData,
  ImportStage,
  advanceToNextStageWithValidation,
  updateStageCompletion,
  executeStageRollback,
  createRollbackConfig,
  calculateProgressMetrics,
  validateStageTransition,
  ProgressMetrics,
} from "@/utils/importPreviewService";
import { UnmatchedMemberResolution } from "@/components/admin/division/UnmatchedMemberResolution";
import { OverAllotmentReview } from "@/components/admin/division/OverAllotmentReview";
import { DuplicateAndFinalReview } from "@/components/admin/division/DuplicateAndFinalReview";
import { DatabaseReconciliationReview } from "@/components/admin/division/DatabaseReconciliationReview";

interface StagedImportPreviewProps {
  stagedPreview: StagedImportPreviewData;
  onClose: () => void;
  onImportComplete: (result: { success: boolean; count: number }) => void;
}

interface StageHelpContent {
  title: string;
  description: string;
  steps: string[];
  tips: string[];
  warnings?: string[];
}

const STAGE_HELP_CONTENT: Record<ImportStage, StageHelpContent> = {
  unmatched: {
    title: "Unmatched Member Resolution",
    description:
      "Some imported requests could not be automatically matched to existing members. You need to resolve these before proceeding.",
    steps: [
      "Review each unmatched request carefully",
      "Search for the correct member using the search box",
      "Select the matching member from search results",
      "Or choose to skip the request if it's invalid",
      "All unmatched items must be resolved to continue",
    ],
    tips: [
      "Try searching with just the last name if full name doesn't work",
      "Check for common name variations (Mike vs Michael)",
      "Look for similar spellings or typos in the original data",
      "Use PIN numbers if available for more accurate matching",
    ],
    warnings: ["Skipped requests will not be imported", "Double-check member assignments before proceeding"],
  },
  over_allotment: {
    title: "Over-Allotment Resolution",
    description:
      "Some dates have more requests than available allotments. You need to decide which requests to approve and which to waitlist.",
    steps: [
      "Review each over-allotted date",
      "Choose to keep current allotment or increase it",
      "Drag and drop requests to set priority order",
      "Top requests will be approved, bottom ones waitlisted",
      "Resolve all over-allotment situations to continue",
    ],
    tips: [
      "Consider seniority and request timing when ordering",
      "Increasing allotments affects calendar capacity",
      "Use custom allotment values for specific needs",
      "Check existing requests when making decisions",
    ],
    warnings: ["Allotment changes affect the entire calendar", "Waitlisted requests may not get approved later"],
  },
  duplicates: {
    title: "Duplicate Detection",
    description:
      "Some requests appear to be duplicates of existing entries. Decide whether to skip or import them anyway.",
    steps: [
      "Review each potential duplicate",
      "Compare with existing database entries",
      "Choose to skip duplicates or override",
      "Consider if the duplicate is actually valid",
      "Resolve all duplicate decisions to continue",
    ],
    tips: [
      "Check request dates and times carefully",
      "Consider if member submitted multiple times",
      "Look for legitimate reasons for duplicates",
      "When in doubt, skip to avoid conflicts",
    ],
    warnings: ["Importing duplicates may cause data conflicts", "Skipped duplicates cannot be recovered later"],
  },
  db_reconciliation: {
    title: "Database Reconciliation",
    description: "Review conflicts between existing database requests and iCal import data.",
    steps: [
      "Review each conflict detected",
      "Compare database status vs iCal status",
      "Choose appropriate action for each conflict",
      "Keep as-is or change status (cancelled, approved, waitlisted, transferred)",
      "All conflicts must be reviewed to continue",
    ],
    tips: [
      "Use timestamps to determine which is more recent",
      "Consider if manual changes were made outside the calendar",
      "Check for legitimate reasons for discrepancies",
      "When uncertain, keep existing database state",
    ],
    warnings: ["Changes will be queued until final import", "Review all conflicts carefully before proceeding"],
  },
  final_review: {
    title: "Final Review & Import",
    description: "Review the final import summary and execute the import operation.",
    steps: [
      "Review the import summary statistics",
      "Check approved vs waitlisted counts",
      "Verify allotment adjustments",
      "Review queued database changes",
      "Confirm the import operation",
      "Monitor import progress",
    ],
    tips: [
      "Double-check all numbers before importing",
      "Ensure allotment changes are acceptable",
      "Review database reconciliation changes",
      "Have a backup plan if import fails",
      "Notify affected members after import",
    ],
    warnings: ["Import operation cannot be undone", "Database changes will be permanent"],
  },
};

export function StagedImportPreview({
  stagedPreview: initialStagedPreview,
  onClose,
  onImportComplete,
}: StagedImportPreviewProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [stagedPreview, setStagedPreview] = useState<StagedImportPreviewData>(initialStagedPreview);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMetrics, setProgressMetrics] = useState<ProgressMetrics | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStageGuide, setShowStageGuide] = useState(false);

  // Stage configuration
  const stageConfig = {
    unmatched: {
      title: "Unmatched Members",
      description: "Resolve member matching issues before proceeding",
      icon: "person-outline" as const,
    },
    over_allotment: {
      title: "Over-Allotment Review",
      description: "Manage requests that exceed calendar allotments",
      icon: "calendar-outline" as const,
    },
    duplicates: {
      title: "Duplicate Detection",
      description: "Review and resolve duplicate requests",
      icon: "copy-outline" as const,
    },
    db_reconciliation: {
      title: "Database Reconciliation",
      description: "Review conflicts between database and import data",
      icon: "sync-outline" as const,
    },
    final_review: {
      title: "Final Review",
      description: "Confirm import details and execute",
      icon: "checkmark-circle-outline" as const,
    },
  };

  // Calculate progress metrics when staged preview changes
  useEffect(() => {
    const metrics = calculateProgressMetrics(stagedPreview);
    setProgressMetrics(metrics);
  }, [stagedPreview]);

  // Handle stage advancement with enhanced validation
  const handleAdvanceStage = useCallback(async () => {
    try {
      setIsTransitioning(true);
      setError(null);

      // Use enhanced validation
      const updatedPreview = await advanceToNextStageWithValidation(stagedPreview);
      setStagedPreview(updatedPreview);
    } catch (err: any) {
      setError(err.message || "Failed to advance to next stage");
    } finally {
      setIsTransitioning(false);
    }
  }, [stagedPreview]);

  // Handle going back to previous stage with validation and confirmation
  const handleGoBack = useCallback(
    (targetStage: ImportStage) => {
      // Validate the rollback transition
      const validation = validateStageTransition(stagedPreview, targetStage);

      if (!validation.isValid) {
        Alert.alert(
          "Cannot Go Back",
          `Unable to return to ${stageConfig[targetStage].title}: ${validation.errors.join(", ")}`,
          [{ text: "OK" }]
        );
        return;
      }

      // Create rollback configuration
      const rollbackConfig = createRollbackConfig(targetStage, false);

      // Show confirmation dialog with warnings
      Alert.alert("Confirm Stage Rollback", rollbackConfig.warningMessage, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go Back",
          style: "destructive",
          onPress: async () => {
            try {
              setIsTransitioning(true);
              setError(null);

              const updatedPreview = await executeStageRollback(stagedPreview, rollbackConfig);
              setStagedPreview(updatedPreview);
            } catch (err: any) {
              setError(err.message || "Failed to rollback to previous stage");
            } finally {
              setIsTransitioning(false);
            }
          },
        },
      ]);
    },
    [stagedPreview, stageConfig]
  );

  // Update stage completion
  const handleStageUpdate = useCallback(
    (stage: ImportStage, isComplete: boolean) => {
      console.log(`[StagedImportPreview] handleStageUpdate called: ${stage} = ${isComplete}`);
      setStagedPreview((currentPreview) => {
        console.log(
          `[StagedImportPreview] Current stage data before update:`,
          currentPreview.progressState.stageData[stage].isComplete
        );
        const updatedPreview = updateStageCompletion(currentPreview, stage, isComplete);
        console.log(
          `[StagedImportPreview] Stage data after update:`,
          updatedPreview.progressState.stageData[stage].isComplete
        );
        console.log(`[StagedImportPreview] Can progress:`, updatedPreview.progressState.canProgress);
        return updatedPreview;
      });
    },
    [] // Remove stagedPreview from dependencies since we're using the functional update
  );

  // Update staged preview data
  const handleDataUpdate = useCallback((updatedPreview: StagedImportPreviewData) => {
    setStagedPreview(updatedPreview);
  }, []);

  // Handle stage navigation
  const handleStageNavigation = useCallback(
    async (targetStage: ImportStage) => {
      if (isAdvancing) return;

      try {
        setIsAdvancing(true);
        setError(null);

        // Navigate to the target stage
        const updatedPreview = { ...stagedPreview };
        updatedPreview.progressState.currentStage = targetStage;
        updatedPreview.lastUpdated = new Date();

        handleDataUpdate(updatedPreview);
      } catch (err) {
        console.error("Stage navigation error:", err);
        setError(err instanceof Error ? err.message : "Failed to navigate to stage");
      } finally {
        setIsAdvancing(false);
      }
    },
    [stagedPreview, handleDataUpdate, isAdvancing]
  );

  // Render enhanced progress bar with metrics
  const renderProgressBar = () => {
    const { currentStage, completedStages } = stagedPreview.progressState;
    const stages: ImportStage[] = ["unmatched", "duplicates", "over_allotment", "db_reconciliation", "final_review"];
    const currentIndex = stages.indexOf(currentStage);

    // Safe access to progressMetrics
    const progressPercentage = progressMetrics
      ? ((completedStages.length + progressMetrics.currentStageProgress / 100) / stages.length) * 100
      : 0;

    const stageNames = {
      unmatched: "Unmatched Members",
      duplicates: "Duplicate Detection",
      over_allotment: "Over-Allotment Review",
      db_reconciliation: "Database Reconciliation",
      final_review: "Final Review",
    };

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <ThemedText style={styles.progressTitle} accessibilityRole="header">
            Import Progress
          </ThemedText>
          <ThemedTouchableOpacity
            onPress={() => setShowHelp(true)}
            style={styles.helpButton}
            accessibilityRole="button"
            accessibilityLabel="How staged import works"
            accessibilityHint="Opens detailed guide about the staged import process"
          >
            <Ionicons name="help-circle" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.helpButtonText}>How it works</ThemedText>
          </ThemedTouchableOpacity>
        </View>

        <View
          style={styles.progressBarContainer}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPercentage) }}
          accessibilityLabel={`Import progress: ${Math.round(progressPercentage)}% complete`}
        >
          <View style={[styles.progressBar, { width: `${progressPercentage}%` }]} />
        </View>

        <View style={styles.stageIndicators}>
          {stages.map((stage, index) => {
            const isCompleted = completedStages.includes(stage);
            const isCurrent = stage === currentStage;
            const isAccessible = index <= currentIndex;

            return (
              <ThemedTouchableOpacity
                key={stage}
                style={[styles.stageIndicator, isCompleted && styles.completedStage, isCurrent && styles.currentStage]}
                onPress={() => {
                  if (isAccessible && stage !== currentStage) {
                    handleStageNavigation(stage);
                  }
                }}
                disabled={!isAccessible || stage === currentStage}
                accessibilityRole="button"
                accessibilityLabel={`Stage ${index + 1}: ${stageNames[stage]}`}
                accessibilityState={{
                  selected: isCurrent,
                  disabled: !isAccessible,
                }}
                accessibilityHint={
                  isCurrent
                    ? "Currently active stage"
                    : isCompleted
                    ? "Completed stage, tap to return"
                    : isAccessible
                    ? "Available stage, tap to navigate"
                    : "Stage not yet available"
                }
              >
                <View style={styles.stageIconContainer}>
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={16} color={Colors[colorScheme].success} />
                  ) : isCurrent ? (
                    <Ionicons name="ellipse" size={16} color={Colors[colorScheme].tint} />
                  ) : (
                    <ThemedText style={styles.stageNumber}>{index + 1}</ThemedText>
                  )}
                </View>
                <ThemedText
                  style={[
                    styles.stageLabel,
                    isCompleted && styles.completedStageLabel,
                    isCurrent && styles.currentStageLabel,
                  ]}
                >
                  {stageNames[stage]}
                </ThemedText>
              </ThemedTouchableOpacity>
            );
          })}
        </View>

        {/* Progress metrics with accessibility */}
        {progressMetrics && (
          <View style={styles.progressMetrics}>
            <ThemedText
              style={styles.progressMetricsText}
              accessibilityLabel={`${progressMetrics.completedStages} of ${progressMetrics.totalStages} stages completed. Current stage is ${progressMetrics.currentStageProgress}% complete. Data integrity score: ${progressMetrics.dataIntegrityScore}%`}
            >
              {progressMetrics.completedStages}/{progressMetrics.totalStages} stages •{" "}
              {progressMetrics.currentStageProgress}% current • {progressMetrics.dataIntegrityScore}% integrity
            </ThemedText>
            {progressMetrics.estimatedTimeRemaining && progressMetrics.estimatedTimeRemaining > 0 && (
              <ThemedText
                style={styles.timeEstimate}
                accessibilityLabel={`Estimated ${progressMetrics.estimatedTimeRemaining} minutes remaining`}
              >
                ~{progressMetrics.estimatedTimeRemaining}m remaining
              </ThemedText>
            )}
          </View>
        )}
      </View>
    );
  };

  // Render current stage content
  const renderStageContent = () => {
    const { currentStage, stageData } = stagedPreview.progressState;

    switch (currentStage) {
      case "unmatched":
        return (
          <UnmatchedMemberResolution
            stagedPreview={stagedPreview}
            onStageUpdate={handleStageUpdate}
            onDataUpdate={handleDataUpdate}
          />
        );
      case "duplicates":
        return (
          <DuplicateAndFinalReview
            stagedPreview={stagedPreview}
            onStageUpdate={handleStageUpdate}
            onDataUpdate={handleDataUpdate}
            onImportComplete={onImportComplete}
          />
        );
      case "over_allotment":
        return (
          <OverAllotmentReview
            stagedPreview={stagedPreview}
            onStageUpdate={handleStageUpdate}
            onDataUpdate={handleDataUpdate}
          />
        );
      case "db_reconciliation":
        return (
          <DatabaseReconciliationReview
            stagedPreview={stagedPreview}
            onStagedPreviewUpdate={handleDataUpdate}
            onAdvanceStage={handleAdvanceStage}
          />
        );
      case "final_review":
        return (
          <DuplicateAndFinalReview
            stagedPreview={stagedPreview}
            onStageUpdate={handleStageUpdate}
            onDataUpdate={handleDataUpdate}
            onImportComplete={onImportComplete}
          />
        );
      default:
        return (
          <ThemedView style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>Unknown stage: {currentStage}</ThemedText>
          </ThemedView>
        );
    }
  };

  // Render stage navigation with enhanced validation feedback
  const renderStageNavigation = () => {
    const { currentStage, canProgress } = stagedPreview.progressState;
    const isLastStage = currentStage === "final_review";

    // Check if we can advance with validation
    let canAdvanceWithValidation = canProgress;
    let validationWarnings: string[] = [];

    if (canProgress && !isLastStage) {
      const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "db_reconciliation",
        "final_review",
      ];
      const currentIndex = stageOrder.indexOf(currentStage);
      const nextStage = stageOrder[currentIndex + 1];

      // For over-allotment stage, use simplified validation that matches the component logic
      if (currentStage === "over_allotment") {
        const overAllotmentData = stagedPreview.progressState.stageData.over_allotment;

        // Use the same logic as the OverAllotmentReview component
        const hasAnyOverAllottedDates = overAllotmentData.overAllottedDates.length > 0;

        if (hasAnyOverAllottedDates) {
          // Check if all over-allotted dates are resolved OR can use defaults
          const allDatesResolved = overAllotmentData.overAllottedDates.every((dateInfo) => {
            const hasExplicitOrdering = overAllotmentData.requestOrdering[dateInfo.date];
            const hasExplicitAllotmentDecision = overAllotmentData.allotmentAdjustments[dateInfo.date] !== undefined;

            // If admin has taken explicit actions, they must complete both
            if (hasExplicitOrdering || hasExplicitAllotmentDecision) {
              const hasAllotmentDecision = hasExplicitAllotmentDecision || dateInfo.overAllotmentCount === 0;
              return hasExplicitOrdering && hasAllotmentDecision;
            }

            // If admin hasn't taken any explicit actions, accept defaults
            return true;
          });

          canAdvanceWithValidation = allDatesResolved;

          if (!allDatesResolved) {
            validationWarnings.push("Some over-allotted dates still need resolution");
          }
        } else {
          // No over-allotted dates, can proceed
          canAdvanceWithValidation = true;
        }
      } else {
        // For other stages, use the standard validation
        const validation = validateStageTransition(stagedPreview, nextStage);
        canAdvanceWithValidation = validation.canProceed;
        validationWarnings = validation.warnings;
      }
    }

    return (
      <View style={styles.navigationContainer}>
        <Button onPress={onClose} variant="secondary" style={styles.navigationButton}>
          Cancel Import
        </Button>

        {/* Show validation warnings if any */}
        {validationWarnings.length > 0 && (
          <View style={styles.warningContainer}>
            <Ionicons name="warning-outline" size={16} color={Colors[colorScheme].warning} />
            <ThemedText style={styles.warningText}>{validationWarnings.join(", ")}</ThemedText>
          </View>
        )}

        {!isLastStage && (
          <Button
            onPress={handleAdvanceStage}
            disabled={!canAdvanceWithValidation || isTransitioning}
            variant="primary"
            style={styles.navigationButton}
          >
            {isTransitioning ? "Processing..." : "Continue"}
          </Button>
        )}
      </View>
    );
  };

  // Render contextual help for current stage
  const renderStageHelp = () => {
    const helpContent = STAGE_HELP_CONTENT[stagedPreview.progressState.currentStage];

    return (
      <View style={styles.stageHelpContainer}>
        <View style={styles.stageHelpHeader}>
          <Ionicons name="help-circle" size={20} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.stageHelpTitle}>Stage Help</ThemedText>
          <ThemedTouchableOpacity onPress={() => setShowStageGuide(true)} style={styles.detailedHelpButton}>
            <Ionicons name="information-circle" size={16} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.detailedHelpText}>Detailed Guide</ThemedText>
          </ThemedTouchableOpacity>
        </View>

        <ThemedText style={styles.stageHelpDescription}>{helpContent.description}</ThemedText>

        <View style={styles.quickTips}>
          <ThemedText style={styles.quickTipsTitle}>Quick Tips:</ThemedText>
          {helpContent.tips.slice(0, 2).map((tip, index) => (
            <View key={index} style={styles.tipItem}>
              <Ionicons name="bulb" size={12} color={Colors[colorScheme].warning} />
              <ThemedText style={styles.tipText}>{tip}</ThemedText>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Render detailed stage guide modal
  const renderStageGuideModal = () => {
    const helpContent = STAGE_HELP_CONTENT[stagedPreview.progressState.currentStage];

    return (
      <Modal
        visible={showStageGuide}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStageGuide(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>{helpContent.title}</ThemedText>
            <ThemedTouchableOpacity onPress={() => setShowStageGuide(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
            </ThemedTouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>Overview</ThemedText>
              <ThemedText style={styles.helpSectionText}>{helpContent.description}</ThemedText>
            </View>

            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>Step-by-Step Instructions</ThemedText>
              {helpContent.steps.map((step, index) => (
                <View key={index} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <ThemedText style={styles.stepNumberText}>{index + 1}</ThemedText>
                  </View>
                  <ThemedText style={styles.stepText}>{step}</ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>Tips & Best Practices</ThemedText>
              {helpContent.tips.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Ionicons name="bulb" size={16} color={Colors[colorScheme].warning} />
                  <ThemedText style={styles.tipText}>{tip}</ThemedText>
                </View>
              ))}
            </View>

            {helpContent.warnings && (
              <View style={styles.helpSection}>
                <ThemedText style={[styles.helpSectionTitle, styles.warningTitle]}>Important Warnings</ThemedText>
                {helpContent.warnings.map((warning, index) => (
                  <View key={index} style={styles.warningItem}>
                    <Ionicons name="warning" size={16} color={Colors[colorScheme].error} />
                    <ThemedText style={styles.modalWarningText}>{warning}</ThemedText>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </ThemedView>
      </Modal>
    );
  };

  // Render "How Staged Import Works" guide modal
  const renderHowItWorksModal = () => {
    return (
      <Modal
        visible={showHelp}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHelp(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>How Staged Import Works</ThemedText>
            <ThemedTouchableOpacity onPress={() => setShowHelp(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
            </ThemedTouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>Overview</ThemedText>
              <ThemedText style={styles.helpSectionText}>
                Staged Import is a comprehensive workflow that ensures data integrity by processing your iCal import
                through multiple validation stages. Each stage must be completed before advancing to the next.
              </ThemedText>
            </View>

            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>The Four Stages</ThemedText>

              <View style={styles.stageOverview}>
                <View style={styles.stageOverviewItem}>
                  <View style={[styles.stageIcon, { backgroundColor: Colors[colorScheme].tint + "20" }]}>
                    <Ionicons name="person-add" size={20} color={Colors[colorScheme].tint} />
                  </View>
                  <View style={styles.stageOverviewContent}>
                    <ThemedText style={styles.stageOverviewTitle}>1. Unmatched Members</ThemedText>
                    <ThemedText style={styles.stageOverviewText}>
                      Resolve requests that couldn't be matched to existing members
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.stageOverviewItem}>
                  <View style={[styles.stageIcon, { backgroundColor: Colors[colorScheme].error + "20" }]}>
                    <Ionicons name="copy" size={20} color={Colors[colorScheme].error} />
                  </View>
                  <View style={styles.stageOverviewContent}>
                    <ThemedText style={styles.stageOverviewTitle}>2. Duplicates</ThemedText>
                    <ThemedText style={styles.stageOverviewText}>
                      Review and resolve potential duplicate requests before allotment calculations
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.stageOverviewItem}>
                  <View style={[styles.stageIcon, { backgroundColor: Colors[colorScheme].warning + "20" }]}>
                    <Ionicons name="reorder-four" size={20} color={Colors[colorScheme].warning} />
                  </View>
                  <View style={styles.stageOverviewContent}>
                    <ThemedText style={styles.stageOverviewTitle}>3. Over-Allotment</ThemedText>
                    <ThemedText style={styles.stageOverviewText}>
                      Handle dates with more requests than available allotments
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.stageOverviewItem}>
                  <View style={[styles.stageIcon, { backgroundColor: Colors[colorScheme].success + "20" }]}>
                    <Ionicons name="checkmark-done" size={20} color={Colors[colorScheme].success} />
                  </View>
                  <View style={styles.stageOverviewContent}>
                    <ThemedText style={styles.stageOverviewTitle}>4. Final Review</ThemedText>
                    <ThemedText style={styles.stageOverviewText}>
                      Review summary and execute the import operation
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.helpSection}>
              <ThemedText style={styles.helpSectionTitle}>Key Benefits</ThemedText>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons name="shield-checkmark" size={16} color={Colors[colorScheme].success} />
                  <ThemedText style={styles.benefitText}>Data integrity validation at each step</ThemedText>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="arrow-back" size={16} color={Colors[colorScheme].tint} />
                  <ThemedText style={styles.benefitText}>Ability to go back and make changes</ThemedText>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="eye" size={16} color={Colors[colorScheme].warning} />
                  <ThemedText style={styles.benefitText}>Clear visibility into import decisions</ThemedText>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="settings" size={16} color={Colors[colorScheme].textDim} />
                  <ThemedText style={styles.benefitText}>Granular control over import process</ThemedText>
                </View>
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>
    );
  };

  // Enhanced header with accessibility
  const renderHeader = () => {
    return (
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="layers" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.title} accessibilityRole="header">
            Staged Import Preview
          </ThemedText>
        </View>
        <ThemedTouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close staged import preview"
          accessibilityHint="Returns to the main import screen"
        >
          <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
        </ThemedTouchableOpacity>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      {renderHeader()}

      {/* Description */}
      <ThemedText style={styles.description}>
        {stageConfig[stagedPreview.progressState.currentStage].description}
      </ThemedText>

      {/* Progress Bar */}
      {renderProgressBar()}

      {/* Error Display */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={20} color={Colors[colorScheme].error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      {/* Stage Content */}
      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {renderStageContent()}
      </ScrollView>

      {/* Navigation */}
      {renderStageNavigation()}

      {/* Loading Overlay */}
      {isTransitioning && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
            <ThemedText style={styles.loadingText}>
              {stagedPreview.progressState.currentStage === "unmatched"
                ? "Analyzing member matches..."
                : stagedPreview.progressState.currentStage === "duplicates"
                ? "Detecting duplicates..."
                : stagedPreview.progressState.currentStage === "over_allotment"
                ? "Checking allotments..."
                : "Preparing final review..."}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Stage Help */}
      {renderStageHelp()}

      {/* Stage Guide Modal */}
      {renderStageGuideModal()}

      {/* How Staged Import Works Modal */}
      {renderHowItWorksModal()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 12,
  },
  closeButton: {
    padding: 8,
  },
  description: {
    fontSize: 16,
    padding: 16,
    paddingBottom: 8,
    color: Colors.dark.textDim,
  },
  progressContainer: {
    padding: 16,
    backgroundColor: Colors.dark.card,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  helpButton: {
    padding: 8,
  },
  helpButtonText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  progressBarContainer: {
    height: 20,
    backgroundColor: Colors.dark.border,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.dark.success,
  },
  stageIndicators: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stageIndicator: {
    flex: 1,
    alignItems: "center",
  },
  completedStage: {
    // Additional styling for completed steps
  },
  currentStage: {
    // Additional styling for current step
  },
  stageIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stageNumber: {
    fontSize: 12,
    fontWeight: "600",
  },
  stageLabel: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  completedStageLabel: {
    color: Colors.dark.success,
    fontWeight: "500",
  },
  currentStageLabel: {
    color: Colors.dark.tint,
    fontWeight: "600",
  },
  progressMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  progressMetricsText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  timeEstimate: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.dark.error,
    marginLeft: 8,
  },
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  navigationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  navigationButton: {
    minWidth: 120,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: Colors.dark.warning + "20",
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  warningText: {
    color: Colors.dark.warning,
    marginLeft: 8,
    fontSize: 12,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dark.background + "90",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  stageHelpContainer: {
    padding: 16,
    backgroundColor: Colors.dark.card,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  stageHelpHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  stageHelpTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  detailedHelpButton: {
    padding: 8,
  },
  detailedHelpText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  stageHelpDescription: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  quickTips: {
    marginTop: 12,
  },
  quickTipsTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  helpSection: {
    marginBottom: 24,
  },
  helpSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  helpSectionText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  stepNumber: {
    width: 24,
    marginRight: 8,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  warningTitle: {
    color: Colors.dark.error,
    fontWeight: "600",
  },
  warningItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  modalWarningText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  stageOverview: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  stageOverviewItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  stageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  stageOverviewContent: {
    flex: 1,
  },
  stageOverviewTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  stageOverviewText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  benefitsList: {
    marginTop: 12,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
});
