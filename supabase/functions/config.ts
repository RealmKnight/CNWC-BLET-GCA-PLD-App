// Twilio Configuration
export const TWILIO_CONFIG = {
  accountSid: Deno.env.get("TWILIO_ACCOUNT_SID"),
  authToken: Deno.env.get("TWILIO_AUTH_TOKEN"),
  fromNumber: Deno.env.get("TWILIO_FROM_NUMBER"),
};

// SMTP Configuration
export const SMTP_CONFIG = {
  host: Deno.env.get("SMTP_HOST"),
  port: parseInt(Deno.env.get("SMTP_PORT") ?? "587"),
  username: Deno.env.get("SMTP_USERNAME"),
  password: Deno.env.get("SMTP_PASSWORD"),
  fromEmail: Deno.env.get("SMTP_FROM_EMAIL"),
};

// Supabase Configuration
export const SUPABASE_CONFIG = {
  url: Deno.env.get("SUPABASE_URL"),
  anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
};
