# Change Request Processing Plan

We will no longer be allowing the company admin to log into the application directly and instead will send emails for request processing to the company admin and have replies sent to our webhook to be processed in the DB and the app

## example supabase edge functions

The functions at the paths listed below will need to be updated to include the correct fully pathed DB tables/columns and the correct variables from the app. We will need to update the various submit request functions to use the new edge functions

Supabase Edge Function for sending initial request email
`supabase/functions/send-request-email/index.js`

Supabase Edge Function for sending cancellation request email
`supabase/functions/send-cancellation-email/index.js`

Supabase Edge Function for processing email webhooks from Mailgun
`supabase/functions/process-email-webhook/index.js`

Supabase Edge Function for sending notification emails when status changes
`supabase/functions/process-status-changes/index.js`
// This function would be scheduled to run every few minutes - we should update the member and admin emails to html emails and use the template from the send-email edge function to include the app logo

// Create webhook trigger function in Supabase
// This function will run whenever a time_off_request status is updated

```sql
CREATE OR REPLACE FUNCTION public.handle_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    -- Insert a record in the status_change_queue table for processing
    INSERT INTO public.status_change_queue (request_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE OR REPLACE TRIGGER on_status_change
AFTER UPDATE ON public.pld_sdv_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_status_change();

-- Create a queue table for status changes to be processed
CREATE TABLE public.status_change_queue (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.pld_sdv_requests(id),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
