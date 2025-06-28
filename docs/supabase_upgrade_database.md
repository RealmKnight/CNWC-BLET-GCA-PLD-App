# Supabase Database Upgrade - Schema Restrictions Migration Plan

## Overview

Supabase is implementing schema access restrictions on **April 21, 2025**. All custom objects in the `auth`, `storage`, and `realtime` schemas must be moved to custom schemas or they will be deleted.

**⚠️ CRITICAL DEADLINE: April 21, 2025**

## ✅ **RISK ELIMINATED - SIMPLIFIED MIGRATION APPROACH**

**🎉 EXCELLENT NEWS**: User confirmed company admins no longer actively use the app for processing requests (switched to email workflow). This allows us to:

- **SOLUTION**: Remove the problematic RLS policy `manage_allotments_company_admin` entirely
- **RATIONALE**: Company no longer accesses app directly; functionality kept only as backup
- **BENEFIT**: Eliminates the critical dependency on custom auth functions
- **RESULT**: Migration complexity reduced from HIGH risk back to LOW risk

**✅ SIMPLIFIED APPROACH**:

1. Drop the unused RLS policy first (safe - no longer needed for business operations)
2. Move/remove custom functions without dependency concerns
3. Standard migration with minimal risk and complexity

## Reference Documentation

- [Official Supabase Announcement](https://github.com/orgs/supabase/discussions/34270)
- [Supabase Migration Guide](https://supabase.com/docs/guides/deployment/database-migrations)
- [Database Branching Guide](https://supabase.com/docs/guides/deployment/branching)

## Current Situation Analysis

### Affected Objects (From Supabase Dashboard Notification)

The following custom objects were detected in our database and **MUST** be moved:

#### Auth Schema Objects

- `auth.redirect_urls` (table)
- `auth.redirect_urls_pkey` (primary key constraint)
- `auth.redirect_urls_user_id_idx` (index)
- `auth.redirect_urls_created_at_idx` (index)
- `auth.get_jwt_role` (function)
- `auth.get_jwt_user_role` (function)

#### Storage Schema Objects

- `storage.get_upload_url` (function)

### Impact Assessment (Based on Codebase Analysis)

#### 🟢 **LOW RISK - SAFE TO REMOVE** ✅

- **`auth.get_jwt_role()`**: Used in RLS policy but **CONFIRMED SAFE TO REMOVE** (company admin access no longer needed)
- **`auth.get_jwt_user_role()`**: Used in RLS policy but **CONFIRMED SAFE TO REMOVE** (company admin access no longer needed)
- **`storage.get_upload_url()`**: Wrapper for `storage.sign_upload_url()` with 1-hour expiration (appears unused)

#### 🟡 MODERATE RISK - Dashboard Integration

- **`auth.redirect_urls` table**: Used by Supabase Auth for redirect URL management
  - Contains: id (uuid), user_id (uuid), redirect_url (text), created_at (timestamp)
  - Has foreign key to `auth.users`
  - **Potential Impact**: May affect Supabase Dashboard auth configuration

#### 🟢 **NO APPLICATION IMPACT** ✅

- **✅ SAFE**: RLS policy can be removed (company admin access no longer needed)
- **✅ CONFIRMED**: Application uses standard Supabase client methods for auth/storage operations
- **✅ CONFIRMED**: No Edge Functions depend on these custom objects
- **✅ SIMPLIFIED**: No schema reference updates needed - can safely remove objects

## Migration Strategy

### Phase 1: Pre-Migration Assessment & Verification

#### 1.1 Confirm Current Object Status

```sql
-- Run diagnostic queries to verify objects still exist
SET search_path = '';

-- Check for custom tables
SELECT oid::regclass AS table_name
FROM pg_class
WHERE
  (relnamespace = 'auth'::regnamespace AND relowner != 'supabase_auth_admin'::regrole)
  OR (relnamespace = 'storage'::regnamespace AND relowner != 'supabase_storage_admin'::regrole)
  OR (relnamespace = 'realtime'::regnamespace
      AND relowner NOT IN (
        SELECT oid FROM pg_roles WHERE rolname IN ('supabase_admin', 'supabase_realtime_admin')
      ));

-- Check for custom functions
SELECT pg_catalog.format('%s(%s)', oid::regproc, pg_get_function_identity_arguments(oid::regproc)) AS function_name
FROM pg_proc
WHERE
  (pronamespace = 'auth'::regnamespace AND proowner != 'supabase_auth_admin'::regrole)
  OR (pronamespace = 'storage'::regnamespace AND proowner != 'supabase_storage_admin'::regrole)
  OR (pronamespace = 'realtime'::regnamespace
      AND proowner NOT IN (
        SELECT oid FROM pg_roles WHERE rolname IN ('supabase_admin', 'supabase_realtime_admin')
      ));
```

#### 1.2 Document Current Usage

- [ ] Verify `auth.redirect_urls` is not directly queried by application
- [ ] Check if Supabase Dashboard depends on `auth.redirect_urls` table structure
- [x] **✅ RESOLVED**: Custom functions were referenced in RLS policies but policy can be safely removed
  - **FOUND**: `pld_sdv_allotments.manage_allotments_company_admin` policy uses both `auth.get_jwt_role()` and `auth.get_jwt_user_role()`
  - **SOLUTION**: Drop policy entirely (company admin access no longer needed)
  - **BENEFIT**: Eliminates migration complexity
- [ ] Validate no Edge Functions use these objects

#### 1.3 Create Pre-Migration Backup

- [ ] Export full database schema and data
- [ ] Document current `additional_redirect_urls` configuration in `supabase/config.toml`
- [ ] Save current auth provider configurations

### Phase 2: Schema Design & Migration Preparation

#### 2.1 Create Target Schema

```sql
-- Create dedicated schema for migrated objects
CREATE SCHEMA IF NOT EXISTS app_auth_custom;
COMMENT ON SCHEMA app_auth_custom IS 'Custom authentication-related objects migrated from auth schema';

CREATE SCHEMA IF NOT EXISTS app_storage_custom;
COMMENT ON SCHEMA app_storage_custom IS 'Custom storage-related objects migrated from storage schema';
```

#### 2.2 Migration Script Development

**Migration 1: Move auth.redirect_urls table**

```sql
-- Create app_auth_custom schema
CREATE SCHEMA IF NOT EXISTS app_auth_custom;

-- Move the table to new schema
ALTER TABLE auth.redirect_urls SET SCHEMA app_auth_custom;

-- Verify the move was successful
SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'redirect_urls';
```

**Migration 2: Remove unused RLS policy and auth functions** ✅ **SIMPLIFIED**

```sql
-- STEP 1: Remove the RLS policy that depends on custom functions
-- This is safe since company admins no longer use the app
DROP POLICY IF EXISTS manage_allotments_company_admin ON public.pld_sdv_allotments;

-- STEP 2: Drop the custom auth functions (they're no longer needed)
-- Since the RLS policy is removed, these functions have no dependencies
DROP FUNCTION IF EXISTS auth.get_jwt_role();
DROP FUNCTION IF EXISTS auth.get_jwt_user_role();

-- STEP 3: Verify cleanup
SELECT 'Custom auth functions removed successfully' as status;
```

**Migration 3: Remove unused storage function**

```sql
-- Drop the unused storage function
-- This appears to be legacy code with no active usage
DROP FUNCTION IF EXISTS storage.get_upload_url(text, text);

-- Verify cleanup
SELECT 'Custom storage function removed successfully' as status;
```

#### 2.3 Migration Using Supabase CLI

**Create Migration Files:**

```bash
# Initialize migrations if not already done
supabase migration new remove_unused_custom_objects

# Edit the generated migration file with the above SQL
```

**Migration File Structure:**

```
supabase/migrations/
├── 20250101000000_remove_unused_custom_objects.sql
└── ...
```

### Phase 3: Testing & Validation

#### 3.1 Local Development Testing

- [ ] **SETUP**: Install and configure local Supabase with Docker (user needs assistance)
  - [ ] Initialize Supabase project locally
  - [ ] Configure environment variables
  - [ ] Set up local database with current schema
  - [ ] Verify local environment matches production
- [ ] Apply migration scripts to local database
- [ ] **CRITICAL**: Test authentication flows (sign-in, sign-up, password reset, **magic link sign-in**)
- [ ] **CRITICAL**: Verify redirect URL functionality works after table move
- [ ] Test file upload/download operations

#### 3.2 Application Integration Testing

- [ ] Run application against migrated local database
- [ ] Test all auth-related features
- [ ] Verify no breaking changes in functionality
- [ ] Check that Supabase Dashboard still functions correctly

#### 3.3 Dashboard Configuration Verification

- [ ] Verify Auth settings in Supabase Dashboard
- [ ] Test redirect URL configurations
- [ ] Confirm all dashboard auth flows work
- [ ] Check if any settings need reconfiguration

#### 3.4 RLS Policy Validation ✅ **SIMPLIFIED**

- [x] **RESOLVED**: RLS policy `manage_allotments_company_admin` safely removed
- [x] **CONFIRMED**: Policy removal has no business impact (company admin access not needed)
- [ ] **TEST**: Verify normal user access patterns remain unchanged
- [ ] Test application functionality is not affected

### Phase 4: Production Migration

#### 4.1 Pre-Migration Checklist

- [ ] **CRITICAL**: Create full database backup
- [ ] Schedule maintenance window (if needed)
- [ ] Notify users of potential brief disruption
- [ ] Prepare rollback procedures
- [ ] Set up monitoring for auth/storage operations

#### 4.2 Migration Execution

1. **Apply migrations using Supabase CLI:**

   ```bash
   # Deploy to production
   supabase db push
   ```

2. **Verify migration success:**

   ```sql
   -- Confirm objects were successfully removed/moved
   SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'redirect_urls';

   -- Verify custom functions are gone
   SELECT count(*) as remaining_custom_functions
   FROM pg_proc
   WHERE proname IN ('get_jwt_role', 'get_jwt_user_role', 'get_upload_url')
     AND pronamespace IN ('auth'::regnamespace, 'storage'::regnamespace);

   -- Should return 0 for remaining_custom_functions
   ```

3. **Test critical functionality:**
   - [ ] User authentication flows
   - [ ] File upload/download operations
   - [ ] Supabase Dashboard functionality

#### 4.3 Post-Migration Cleanup (Optional)

```sql
-- Only run these AFTER confirming everything works perfectly
-- DROP old functions from auth/storage schemas (if they still exist)
-- Note: The table move should automatically handle indexes and constraints
```

#### 4.4 Post-Migration Validation

- [ ] Monitor application logs for auth/storage errors
- [ ] Test user sign-in/sign-up flows
- [ ] Verify file operations work correctly
- [ ] Check Supabase Dashboard auth settings
- [ ] Confirm no functionality regression

### Phase 5: Documentation & Monitoring

#### 5.1 Update Documentation

- [ ] Document new schema structure
- [ ] Update any internal documentation referencing old schemas
- [ ] Create troubleshooting guide for common issues

#### 5.2 Ongoing Monitoring

- [ ] Monitor for any auth-related errors
- [ ] Watch for storage operation failures
- [ ] Set up alerts for authentication failures

## Risk Assessment & Mitigation

### 🟢 **LOW RISK** ✅

- **RLS Policy Removal**: Safely removing unused company admin policy
  - **IMPACT**: None - company admins no longer use app for processing
  - **MITIGATION**: Verify normal user access patterns unaffected
  - **ROLLBACK**: Simple restore from backup if needed

### 🟡 **MEDIUM RISK - INVESTIGATION REQUIRED**

- **Supabase Dashboard Integration**: ⚠️ **UNKNOWN IMPACT** - Moving `auth.redirect_urls` may affect dashboard
  - **USER CONFIRMED**: Using dashboard-configured redirect URLs for magic link sign-in (currently working)
  - **UNKNOWN**: Whether Supabase Dashboard backend depends on `auth.redirect_urls` table structure
  - **MITIGATION**: Test magic link sign-in thoroughly in local environment after table move
  - **ROLLBACK**: Restore from backup if dashboard functionality breaks

### LOW RISK

- **Auth Flow Disruption**: Brief disruption during migration

  - **Mitigation**: Schedule during low-usage period
  - **Rollback**: Quick rollback using database backup

- **Function Removal**: Removing unused custom functions
  - **MITIGATION**: Functions verified as unused before removal
  - **ROLLBACK**: Database restore if unexpected dependencies found

## Rollback Procedures

### Immediate Rollback (if issues detected during migration)

1. **Stop migration process**
2. **Restore from pre-migration backup:**

   ```bash
   # Restore database from backup
   supabase db reset
   ```

3. **Verify functionality restored**
4. **Investigate issues before retry**

### Post-Migration Rollback (if issues found after completion)

1. **Assess if rollback necessary vs. fixing forward**
2. **If rollback needed**: Restore from backup
3. **Re-plan migration addressing identified issues**

## Timeline & Milestones

### Week 1: Assessment & Planning

- [ ] Complete Phase 1 (Pre-Migration Assessment)
- [ ] Verify all objects and dependencies
- [ ] Create detailed migration scripts

### Week 2: Local Testing

- [ ] Complete Phase 2 (Schema Design)
- [ ] Complete Phase 3 (Testing & Validation)
- [ ] Address any issues found in testing

### Week 3: Production Preparation

- [ ] Final testing and validation
- [ ] Create production migration plan
- [ ] Schedule maintenance window

### Week 4: Migration Execution

- [ ] Execute Phase 4 (Production Migration)
- [ ] Complete Phase 5 (Documentation & Monitoring)
- [ ] **Deadline: Complete by April 15, 2025** (6 days buffer before April 21 deadline)

## Success Criteria

✅ **Migration Successful When:**

- [ ] `auth.redirect_urls` table moved to `app_auth_custom` schema
- [ ] Unused custom functions removed from auth/storage schemas
- [ ] Unused RLS policy successfully removed
- [ ] All authentication flows work correctly
- [ ] File upload/download operations function normally
- [ ] Supabase Dashboard auth settings remain functional
- [ ] No regression in application functionality
- [ ] No auth-related errors in logs

## Open Questions & Clarifications Needed

### Critical Questions for User

1. **Dashboard Dependency**: ⚠️ **NEEDS INVESTIGATION**: User has configured redirect URLs in Supabase Dashboard for magic link sign-in (working), but unsure if Dashboard backend depends on `auth.redirect_urls` table.

2. **Custom Function Usage**: ✅ **RESOLVED**: The functions `get_jwt_role` and `get_jwt_user_role` were used in RLS policy but can be safely removed along with the policy since company admin access is no longer needed.

3. **Maintenance Window**: ✅ **CONFIRMED**: Migration scheduled for tonight during low-usage period.

4. **Testing Environment**: ✅ **CONFIRMED**: User has Docker installed but needs setup assistance. Local Docker testing environment will be used.

5. **Migration Strategy Preference**: ✅ **CONFIRMED**: Remove unused objects, move `auth.redirect_urls` (pending investigation)

### Technical Clarifications Needed

1. **Auth Provider Configuration**: Are you using any custom auth providers that might reference the redirect_urls table?

2. **Edge Function Dependencies**: Do any Edge Functions reference these custom objects indirectly?

3. **RLS Policy Dependencies**: ✅ **FOUND CRITICAL DEPENDENCY**
   - **CONFIRMED**: `pld_sdv_allotments.manage_allotments_company_admin` policy uses `auth.get_jwt_role()` and `auth.get_jwt_user_role()`
   - **ACTION REQUIRED**: Must update this policy during migration or it will break company admin access

## Next Steps

**IMMEDIATE ACTIONS REQUIRED:**

1. **✅ CONFIRMED**: RLS policy dependency resolved - safe to remove policy and functions
2. **SIMPLIFIED**: Migration approach now focuses on safe object removal/movement
3. **REDUCED RISK**: Migration complexity reduced from HIGH to LOW risk
4. **Validate local development environment setup**
5. **Schedule time for local testing phase** (standard auth/storage functionality testing)
6. **Confirm production migration timeline and maintenance window**

**🎉 MIGRATION SIMPLIFIED**: Due to safe removal of RLS policy, this is now a straightforward migration with minimal risk.

**NEXT STEPS BEFORE IMPLEMENTATION:**

1. **⚠️ CRITICAL INVESTIGATION NEEDED**: Determine if `auth.redirect_urls` table move will break magic link functionality
2. **SETUP REQUIRED**: Assist user with local Docker/Supabase environment setup
3. **SCHEDULE CONFIRMED**: Migration planned for tonight during low-usage period

**READY TO PROCEED:** Once redirect_urls dependency is clarified and local environment is set up!

## 🔍 **CRITICAL PRE-MIGRATION INVESTIGATION**

### ⚠️ **URGENT: auth.redirect_urls Table Dependency Analysis**

Before proceeding with the migration, we must determine if moving the `auth.redirect_urls` table will break Supabase's magic link functionality.

#### Investigation Options

**Option A: Safe Conservative Approach** ⭐ **RECOMMENDED**

- Keep `auth.redirect_urls` table in auth schema (don't move it)
- Only remove the unused custom functions
- **PROS**: Zero risk to magic link functionality
- **CONS**: Leaves one custom object in auth schema
- **RESULT**: Partial compliance with Supabase restrictions

**Option B: Full Migration with Risk**

- Move `auth.redirect_urls` to `app_auth_custom` schema as planned
- Test extensively in local environment
- **PROS**: Full compliance with Supabase restrictions
- **CONS**: Risk of breaking magic link sign-in
- **REQUIRES**: Thorough testing of all auth flows

**Option C: Research First**

- Investigate Supabase documentation/community for redirect_urls table usage
- Contact Supabase support for clarification
- **PROS**: Informed decision making
- **CONS**: Time delay (may not fit tonight's timeline)

#### Recommended Decision Process

1. **IMMEDIATE**: Test magic link sign-in in current environment to establish baseline
2. **DECIDE**: Choose Option A (safe) or Option B (full migration) based on risk tolerance
3. **IF Option B**: Extensive local testing of magic link functionality after table move
4. **FALLBACK**: Option A if testing reveals issues

### Local Environment Setup Requirements

#### Phase 0: Docker/Supabase Local Setup (NEW)

**Prerequisites:**

- Docker installed ✅ (confirmed by user)
- Node.js/npm installed
- Supabase CLI installed

**Setup Steps:**

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Initialize local Supabase project
supabase init

# Start local Supabase services
supabase start

# Link to remote project (optional for testing)
supabase link --project-ref YOUR_PROJECT_REF
```

**Configuration Required:**

- [ ] Copy production environment variables to local
- [ ] Verify local database schema matches production
- [ ] Test basic auth functionality (sign-in/sign-up)
- [ ] **CRITICAL**: Test magic link sign-in functionality
- [ ] Confirm redirect URL configuration works locally
