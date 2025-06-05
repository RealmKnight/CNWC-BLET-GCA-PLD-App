# CAPTCHA Development Guide

## Overview

This app uses Cloudflare Turnstile CAPTCHA to prevent fraud and abuse across authentication operations. CAPTCHA protection is **conditionally enabled** based on your Supabase project settings:

- **Sign-up form** (`app/(auth)/sign-up.tsx`)
- **Forgot password form** (`app/(auth)/forgot-password.tsx`)
- **Sign-in form** (`app/(auth)/sign-in.tsx`)

## Smart CAPTCHA Behavior

### **When CAPTCHA is ENABLED in Supabase:**

- ✅ **CAPTCHA component is shown** to users
- ✅ **Users must complete CAPTCHA** to submit forms
- ✅ **Server-side validation** protects against bots
- ✅ **Full bot protection** is active

### **When CAPTCHA is DISABLED in Supabase:**

- ❌ **CAPTCHA component is hidden** from users
- ✅ **Forms submit immediately** without CAPTCHA friction
- ❌ **No server-side CAPTCHA validation**
- ⚠️ **Reduced bot protection** (rely on other measures)

## Development vs Production

### Development Mode (Localhost)

- **CAPTCHA is automatically DISABLED** for development
- **No CAPTCHA components shown** to developers
- **Forms work without any CAPTCHA friction**
- **Faster development and testing**

### Production Mode

- **CAPTCHA status determined by Supabase settings**
- **If enabled**: Full CAPTCHA protection with real challenges
- **If disabled**: Clean forms without CAPTCHA components

## Environment Variables

```bash
# Production keys (only needed when CAPTCHA is enabled)
EXPO_PUBLIC_TURNSTILE_SITE_KEY=your_real_site_key_here
```

## Enabling/Disabling CAPTCHA

### **To Enable CAPTCHA Protection:**

1. **Configure Turnstile keys in Supabase dashboard:**

   - Go to Authentication > Settings > Bot and Abuse Protection
   - Toggle "Enable CAPTCHA protection" ON
   - Select "Turnstile" as provider
   - Add your production site key and secret key

2. **Set environment variable:**

   ```bash
   EXPO_PUBLIC_TURNSTILE_SITE_KEY=your_production_site_key
   ```

3. **Deploy your app:**
   - CAPTCHA components will automatically appear
   - Users must complete challenges to submit forms
   - Full bot protection is active

### **To Disable CAPTCHA Protection:**

1. **Disable in Supabase dashboard:**

   - Go to Authentication > Settings > Bot and Abuse Protection
   - Toggle "Enable CAPTCHA protection" OFF

2. **Result:**
   - CAPTCHA components automatically disappear
   - Forms submit without CAPTCHA friction
   - Faster user experience, but reduced bot protection

## Testing Scenarios

### **Development Testing:**

```bash
npm start
# CAPTCHA automatically disabled
# Forms work without CAPTCHA
# No domain validation issues
```

### **Production with CAPTCHA Enabled:**

- Real CAPTCHA challenges presented
- Domain validation enforced
- Full bot protection active

### **Production with CAPTCHA Disabled:**

- Clean forms without CAPTCHA
- Faster user experience
- Rely on other security measures

## Error Codes Reference

| Code   | Description                | Solution                                      |
| ------ | -------------------------- | --------------------------------------------- |
| 110200 | Domain validation failed   | Normal in development - automatically handled |
| 110100 | Invalid site key           | Check your site key configuration             |
| 110110 | Invalid secret key         | Check your secret key in Supabase             |
| 300000 | General validation failure | User failed CAPTCHA challenge                 |

## Security Considerations

### **With CAPTCHA Enabled:**

- ✅ **Server-side validation** of all CAPTCHA tokens
- ✅ **Bot protection** on all auth forms
- ✅ **Rate limiting** combined with CAPTCHA challenges
- ✅ **Domain validation** prevents unauthorized use

### **With CAPTCHA Disabled:**

- ⚠️ **No CAPTCHA protection** - bots can submit forms
- ✅ **Rate limiting** still active from Supabase
- ✅ **Other security measures** (email verification, etc.)
- ⚠️ **Consider alternative bot protection** methods

## Recommendations

### **Enable CAPTCHA When:**

- 🚨 **Experiencing bot attacks** or spam registrations
- 🔒 **High security requirements** for your application
- 📈 **Large user base** with potential for abuse
- 🌐 **Public-facing application** with open registration

### **Disable CAPTCHA When:**

- 🚀 **Development and testing** phases
- 👥 **Internal applications** with trusted users
- 📱 **Mobile-first experience** where UX is critical
- 🔧 **Troubleshooting** authentication issues

## Future Enhancements

- **Admin controls:** Allow application admins to toggle CAPTCHA per form
- **Conditional CAPTCHA:** Enable based on suspicious activity patterns
- **Analytics:** Track CAPTCHA success/failure rates for security monitoring
- **A/B testing:** Compare conversion rates with/without CAPTCHA
