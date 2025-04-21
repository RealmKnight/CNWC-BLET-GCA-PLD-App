import { format, parseISO } from "date-fns";

/**
 * Checks if two dates are the same day after formatting them with the specified format
 * @param date1 First date to compare (string or Date)
 * @param date2 Second date to compare (string or Date)
 * @param formatString The format string to use for comparison (e.g., "yyyy-MM-dd")
 * @returns boolean indicating if the dates represent the same day after formatting
 */
export function isSameDayWithFormat(
    date1: string | Date,
    date2: string | Date,
    formatString: string,
): boolean {
    // Convert strings to Date objects if needed
    const d1 = typeof date1 === "string" ? parseISO(date1) : date1;
    const d2 = typeof date2 === "string" ? parseISO(date2) : date2;

    // Format both dates using the provided format string and compare
    return format(d1, formatString) === format(d2, formatString);
}

/**
 * Returns the date that is six months from the current date
 * @returns Date object representing the date six months from now
 */
export function getSixMonthDate(): Date {
    const now = new Date();
    return new Date(
        now.getFullYear(),
        now.getMonth() + 6,
        now.getDate(),
    );
}
