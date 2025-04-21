-- Script to manually process six-month requests for specific dates
-- This is useful for processing requests that may have been missed by the automated processing

-- Process a single specific date (e.g., October 20, 2025)
-- Uncomment and modify this line to process requests for exactly 6 months from a specific date:
-- CALL run_six_month_processor('2025-04-20', '2025-04-20');

-- Process a range of dates (e.g., from April 19 to April 21, 2025)
-- Uncomment and modify these lines to process requests for dates in a range:
-- CALL run_six_month_processor('2025-04-19', '2025-04-21');

-- Check unprocessed requests
-- The following command shows any six-month requests that have not been processed yet:
SELECT 
    s.id, 
    s.member_id, 
    m.first_name, 
    m.last_name, 
    s.request_date, 
    s.leave_type, 
    s.requested_at, 
    s.processed,
    m.wc_sen_roster
FROM 
    six_month_requests s
JOIN 
    members m ON s.member_id = m.id
WHERE 
    s.processed = false
ORDER BY 
    s.request_date, COALESCE(m.wc_sen_roster, 999999);

-- Check specific dates in regular requests table
-- The following command shows existing requests for a specific date:
-- Uncomment and modify to check requests for a specific date:
-- SELECT * FROM pld_sdv_requests WHERE request_date = '2025-10-20' ORDER BY status, waitlist_position;

-- Force process specific member requests
-- If you need to process requests for a specific member only:
/*
DO $$
DECLARE
    v_member_id UUID := '00000000-0000-0000-0000-000000000000'; -- Replace with actual member ID
    v_request RECORD;
BEGIN
    FOR v_request IN 
        SELECT * FROM six_month_requests 
        WHERE member_id = v_member_id AND processed = false
    LOOP
        RAISE NOTICE 'Processing request % for date %', v_request.id, v_request.request_date;
        PERFORM process_six_month_requests(v_request.request_date);
    END LOOP;
END;
$$;
*/

-- View the current seniority values for all members with six month requests
SELECT 
    m.id, 
    m.first_name, 
    m.last_name, 
    m.wc_sen_roster, 
    COUNT(s.id) AS pending_six_month_requests
FROM 
    members m
JOIN 
    six_month_requests s ON m.id = s.member_id AND s.processed = false
GROUP BY 
    m.id, m.first_name, m.last_name, m.wc_sen_roster
ORDER BY 
    COALESCE(m.wc_sen_roster, 999999); 