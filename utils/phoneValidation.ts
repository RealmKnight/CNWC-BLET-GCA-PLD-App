/**
 * Centralized phone number validation and formatting utilities
 * Provides E.164 format conversion, US phone number validation,
 * and phone sanitization functions consistent with backend edge functions
 */

export interface PhoneValidationResult {
    isValid: boolean;
    cleaned: string;
    formatted: string;
    e164: string;
    error?: string;
}

/**
 * Clean and validate a US phone number
 * @param phone - Raw phone number input (can be E.164 format like +15551234567 or clean 10-digit)
 * @returns Validation result with cleaned, formatted, and E.164 versions
 */
export function validateAndFormatPhone(
    phone: string | null | undefined,
): PhoneValidationResult {
    if (!phone) {
        return {
            isValid: false,
            cleaned: "",
            formatted: "",
            e164: "",
            error: "Phone number is required",
        };
    }

    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, "");

    // Handle E.164 format: if 11 digits starting with 1, remove the 1
    if (cleaned.startsWith("1") && cleaned.length === 11) {
        cleaned = cleaned.slice(1);
    }

    // Check for valid US phone number length (should be 10 digits after processing)
    if (cleaned.length !== 10) {
        return {
            isValid: false,
            cleaned,
            formatted: formatPhoneForDisplay(cleaned),
            e164: "",
            error: "Please enter a valid 10-digit US phone number",
        };
    }

    // Format for display and E.164
    const formatted = formatPhoneForDisplay(cleaned);
    const e164 = formatPhoneToE164(cleaned);

    return {
        isValid: true,
        cleaned,
        formatted,
        e164,
    };
}

/**
 * Format phone number for display as (XXX) XXX-XXXX
 * @param phone - Clean numeric phone number
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(
    phone: string | null | undefined,
): string {
    // Handle null/undefined inputs
    if (!phone) {
        return "";
    }

    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, "");

    // Limit to 10 digits for US numbers
    const limited = cleaned.slice(0, 10);

    // Format as (XXX) XXX-XXXX
    if (limited.length >= 6) {
        return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${
            limited.slice(6)
        }`;
    } else if (limited.length >= 3) {
        return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else if (limited.length > 0) {
        return `(${limited}`;
    }
    return "";
}

/**
 * Format phone number to E.164 format for backend processing
 * Consistent with formatPhoneToE164 in edge functions
 * @param phone - Raw phone number input
 * @returns E.164 formatted phone number (+1XXXXXXXXXX)
 */
export function formatPhoneToE164(phone: string | null | undefined): string {
    // Handle null/undefined inputs
    if (!phone) {
        throw new Error("Phone number is required for E.164 formatting");
    }

    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, "");

    // If it starts with 1, assume it's already US format
    if (cleaned.startsWith("1") && cleaned.length === 11) {
        return `+${cleaned}`;
    }

    // If it's 10 digits, assume US number without country code
    if (cleaned.length === 10) {
        return `+1${cleaned}`;
    }

    throw new Error(
        "Invalid phone number format. Please provide a valid US phone number.",
    );
}

/**
 * Sanitize phone number input for form fields
 * @param input - Raw input from user
 * @returns Cleaned numeric string (max 10 digits)
 */
export function sanitizePhoneInput(input: string | null | undefined): string {
    // Handle null/undefined inputs
    if (!input) {
        return "";
    }
    // Remove all non-numeric characters and limit to 10 digits
    return input.replace(/\D/g, "").slice(0, 10);
}

/**
 * Check if phone number is valid US format
 * @param phone - Phone number to validate
 * @returns Boolean indicating validity
 */
export function isValidUSPhone(phone: string | null | undefined): boolean {
    if (!phone) {
        return false;
    }
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length === 10;
}

/**
 * Parse E.164 phone number to clean format
 * @param e164Phone - E.164 formatted phone number (+1XXXXXXXXXX)
 * @returns Clean 10-digit phone number
 */
export function parseE164ToClean(e164Phone: string | null | undefined): string {
    if (!e164Phone) return "";

    // Remove + and country code if present
    const cleaned = e164Phone.replace(/\D/g, "");

    // If it starts with 1 and is 11 digits, remove the 1
    if (cleaned.startsWith("1") && cleaned.length === 11) {
        return cleaned.slice(1);
    }

    // If it's already 10 digits, return as-is
    if (cleaned.length === 10) {
        return cleaned;
    }

    return cleaned;
}

/**
 * Format phone number for submission to backend
 * @param phone - Raw phone number input
 * @returns E.164 formatted phone number ready for API calls
 */
export function formatPhoneForSubmission(
    phone: string | null | undefined,
): string {
    if (!phone) {
        throw new Error("Phone number is required for submission");
    }
    const cleaned = phone.replace(/\D/g, "");
    return `+1${cleaned}`;
}
