import { useState, useCallback } from "react";
import { supabase } from "@/utils/supabase";
import {
  OfficerPosition,
  OfficerAssignment,
  CurrentOfficer,
  POSITION_RULES,
  RequiredPosition,
  OptionalPosition,
} from "@/types/officers";
import { Database } from "@/types/supabase";

interface UseOfficerPositionsProps {
  division: string;
}

interface AssignPositionParams {
  memberPin: number;
  position: OfficerPosition;
  startDate?: string;
}

export function useOfficerPositions({ division }: UseOfficerPositionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current officers for a division
  const fetchCurrentOfficers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log("Fetching officers for division:", division);

      const { data, error } = await supabase
        .from("current_officers")
        .select("*")
        .eq("division", division)
        .is("end_date", null);

      if (error) throw error;

      console.log("Raw data from database:", data);

      // Transform the data to match our CurrentOfficer type
      const transformedData = (data || []).map((officer) => ({
        id: officer.id,
        memberPin: parseInt(officer.member_pin),
        firstName: officer.first_name,
        lastName: officer.last_name,
        phoneNumber: officer.phone_number,
        role: officer.role,
        position: String(officer.position).trim() as OfficerPosition, // Ensure clean string
        division: officer.division,
        startDate: officer.start_date,
        endDate: officer.end_date,
        createdAt: officer.created_at,
        updatedAt: officer.updated_at,
        createdBy: officer.created_by || "",
        updatedBy: officer.updated_by || "",
      }));

      console.log("Transformed data:", transformedData);
      return transformedData;
    } catch (err) {
      console.error("Error fetching officers:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch current officers");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [division]);

  // Fetch position history for a member
  const fetchMemberPositionHistory = useCallback(
    async (memberPin: number) => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("officer_positions")
          .select("*")
          .eq("member_pin", memberPin)
          .eq("division", division)
          .order("start_date", { ascending: false });

        if (error) throw error;

        return data as OfficerAssignment[];
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch position history");
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [division]
  );

  // Validate position assignment
  const validatePositionAssignment = useCallback(
    async (memberPin: number, position: OfficerPosition): Promise<{ isValid: boolean; error?: string }> => {
      try {
        // Get current positions held by the member
        const currentPositions = await fetchMemberPositionHistory(memberPin);
        const activePositions = currentPositions.filter((p) => !p.endDate);

        // Check maximum positions limit
        if (activePositions.length >= POSITION_RULES.maxPositionsPerMember) {
          return {
            isValid: false,
            error: `Members cannot hold more than ${POSITION_RULES.maxPositionsPerMember} positions`,
          };
        }

        // Check mutually exclusive positions
        for (const [pos1, pos2] of POSITION_RULES.mutuallyExclusive) {
          if (position === pos1 || position === pos2) {
            const hasConflict = activePositions.some((p) => p.position === pos1 || p.position === pos2);
            if (hasConflict) {
              return {
                isValid: false,
                error: `Cannot hold both ${pos1} and ${pos2} positions`,
              };
            }
          }
        }

        // Check required positions
        const requirements = POSITION_RULES.requires[position as keyof typeof POSITION_RULES.requires];
        if (requirements?.length > 0) {
          const hasRequired = activePositions.some((p) => requirements.includes(p.position));
          if (!hasRequired) {
            return {
              isValid: false,
              error: `Must hold ${requirements.join(" or ")} to be assigned as ${position}`,
            };
          }
        }

        return { isValid: true };
      } catch (err) {
        return {
          isValid: false,
          error: "Failed to validate position assignment",
        };
      }
    },
    [fetchMemberPositionHistory]
  );

  // Assign position to member
  const assignPosition = useCallback(
    async ({ memberPin, position, startDate = new Date().toISOString() }: AssignPositionParams) => {
      try {
        setIsLoading(true);
        setError(null);

        // Validate the assignment
        const validation = await validatePositionAssignment(memberPin, position);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }

        // End any current assignment for this position
        const { error: updateError } = await supabase
          .from("officer_positions")
          .update({ end_date: new Date().toISOString() })
          .eq("division", division)
          .eq("position", position)
          .is("end_date", null);

        if (updateError) throw updateError;

        // Create new assignment
        const { data, error: insertError } = await supabase
          .from("officer_positions")
          .insert({
            member_pin: memberPin,
            position,
            division,
            start_date: startDate,
            created_by: (await supabase.auth.getUser()).data.user?.id,
            updated_by: (await supabase.auth.getUser()).data.user?.id,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return data as OfficerAssignment;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to assign position");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [division, validatePositionAssignment]
  );

  // Remove position from member
  const removePosition = useCallback(
    async (assignmentId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("officer_positions")
          .update({
            end_date: new Date().toISOString(),
            updated_by: (await supabase.auth.getUser()).data.user?.id,
          })
          .eq("id", assignmentId)
          .select()
          .single();

        if (error) throw error;

        return data as OfficerAssignment;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove position");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase]
  );

  return {
    isLoading,
    error,
    fetchCurrentOfficers,
    fetchMemberPositionHistory,
    assignPosition,
    removePosition,
  };
}
