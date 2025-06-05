# Turnstile CAPTCHA Setup Guide

This app uses a hybrid approach for Cloudflare Turnstile CAPTCHA that works across all platforms:

- **Web**: Uses `@marsidev/react-turnstile` (direct integration)
- **Mobile (iOS/Android)**: Uses `react-native-turnstile` (WebView-based)

## Required Configuration

### 1. Environment Variables

Ensure you have the following in your `.env` file:

```env
EXPO_PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
CLOUDFLARE_TURNSTILE_SECRETKEY=your_secret_key_here
```

### 2. Cloudflare Turnstile Domain Configuration

You need to configure domains in your Cloudflare Turnstile dashboard:

#### For Web Platform

**These are YOUR actual domains where the web app runs:**

- `localhost` (development)
- `127.0.0.1` (development)
- `cnwc-gca-pld-app--dev.expo.app` (Expo dev)
- `cnwc-gca-pld-app--test.expo.app` (Expo preview)
- `cnwc-gca-pld-app.expo.app` (production)
- Your custom domain (if any)

#### For Mobile Platforms (REQUIRED)

**This is the react-native-turnstile bridge domain (NOT your domain):**

- `turnstile.1337707.xyz` ⚠️ **CRITICAL: This domain is required for react-native-turnstile to work**

> **Important**: The web platform uses YOUR domains directly. The mobile platform uses a hosted bridge service on `turnstile.1337707.xyz` that acts as an intermediary between React Native and Cloudflare Turnstile.

### 3. Steps to Configure Domains

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile**
3. Find your site with the key starting with `0x4AAAAAABfTXTjADqXA65F_`
4. Click **Edit** on your site configuration
5. Add all the domains listed above to the **Domains** section
6. **Save** the configuration
7. Wait 2-3 minutes for the configuration to propagate

## How It Works

### Web Platform

- Uses the standard Cloudflare Turnstile JavaScript API
- Loads the script directly from `https://challenges.cloudflare.com/turnstile/v0/api.js`
- **Works with YOUR configured domains directly** (localhost, your Expo domains, custom domains)
- The CAPTCHA challenge runs directly on your website
- No intermediary services needed

### Mobile Platform

- Uses a WebView that loads a hosted Next.js app on `turnstile.1337707.xyz`
- **This hosted app acts as a bridge between React Native and Cloudflare Turnstile**
- The cookies and JavaScript environment work properly in this hosted context
- The bridge communicates back to your React Native app with the verification token
- **Your mobile app never directly contacts Cloudflare** - it goes through the bridge
- This is why you need `turnstile.1337707.xyz` in your domains list (for the bridge, not your app)

## Troubleshooting

### Error 110200 (Domain Validation Failed)

- **Web**: Check that your current domain is in the Cloudflare Turnstile domains list
- **Mobile**: Ensure `turnstile.1337707.xyz` is added to your domains list

### "React Native WebView does not support this platform"

- This error appears when the mobile package is used on web
- The hybrid implementation should prevent this by using the correct package per platform

### CAPTCHA Not Loading

- **Web**: Check browser console for script loading errors
- **Mobile**: Verify network connectivity and that the WebView can load external content

### Development vs Production

- The same site key works for all platforms and environments
- Make sure all your domains (dev, test, production) are configured in Cloudflare

## Component Usage

```tsx
import TurnstileCaptcha from "@/components/ui/TurnstileCaptcha";

// In your component
<TurnstileCaptcha
  onVerify={(token) => {
    // Handle successful verification
    console.log("CAPTCHA verified:", token);
  }}
  onError={(error) => {
    // Handle errors
    console.error("CAPTCHA error:", error);
  }}
  onExpire={() => {
    // Handle token expiration
    console.log("CAPTCHA token expired");
  }}
  theme="auto" // "light", "dark", or "auto"
  size="normal" // "normal" or "compact"
  enabled={true} // Set to false to disable CAPTCHA
/>;
```

## Security Notes

- Never expose your secret key in client-side code
- Always verify the token on your server using the secret key
- The `turnstile.1337707.xyz` domain is a trusted hosted service for react-native-turnstile
- Tokens expire after 5 minutes and should be used immediately after verification
