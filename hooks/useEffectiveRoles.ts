import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { User as AuthUser } from "@supabase/supabase-js";

/**
 * Hook to determine the current user's effective roles by combining
 * their role from the members table (via useUserStore) and
 * potential company_admin role from auth user metadata.
 *
 * @returns {string[] | null} An array of unique effective roles, or null if loading or no user.
 */
export function useEffectiveRoles(): string[] | null {
    const [effectiveRoles, setEffectiveRoles] = useState<string[] | null>(null);
    const member = useUserStore((state) => state.member);
    const [authUser, setAuthUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        async function fetchAuthUser() {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error) throw error;
                if (isMounted) {
                    setAuthUser(user);
                }
            } catch (error) {
                console.error("Error fetching auth user:", error);
                if (isMounted) {
                    setAuthUser(null); // Ensure authUser is reset on error
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchAuthUser();

        // Listen for auth changes to recalculate roles
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                if (isMounted) {
                    setAuthUser(session?.user ?? null);
                }
            },
        );

        return () => {
            isMounted = false;
            subscription?.unsubscribe();
        };
    }, []); // Run once on mount and listen for auth changes

    useEffect(() => {
        // Calculate roles whenever authUser or member data changes
        if (loading) {
            setEffectiveRoles(null); // Still loading
            return;
        }

        const roles: Set<string> = new Set();

        // 1. Check auth metadata for company_admin role
        // IMPORTANT: Adjust 'user_metadata' and 'role' if your metadata structure is different
        const companyAdminRole = authUser?.user_metadata?.role;
        if (companyAdminRole === "company_admin") {
            roles.add(companyAdminRole);
        }

        // 2. Check userStore for member role
        const memberRole = member?.role;
        if (memberRole) {
            roles.add(memberRole);
        }

        setEffectiveRoles(Array.from(roles));
    }, [authUser, member, loading]); // Recalculate when auth user or member changes, or loading finishes

    return effectiveRoles;
}
