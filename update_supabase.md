# Supabase Schema Restriction Migration Plan

## Overview

Supabase is implementing restrictions on auth, storage, and realtime schemas effective July 28th. This plan outlines the steps to assess impact and migrate any affected custom objects.

## Reference

- [GitHub Discussion #34270](https://github.com/orgs/supabase/discussions/34270)
- Email notification received about July 28th deadline

## Affected Schemas & Restrictions

Starting July 28th, the following actions will be restricted on `auth`, `storage`, and `realtime` schemas:

- Create tables and database functions
- Drop existing tables or database functions
- Create indexes on existing tables
- Destructive actions (INSERT, UPDATE, DELETE, TRUNCATE) on migration tables
- Revoking privileges on tables from API roles (e.g. anon)

## Migration Plan

### Phase 0: Postgres Upgrade Investigation (NEW - HIGH PRIORITY)

- [ ] **0.1** Pre-Upgrade Requirements Analysis ✅ COMPLETED
  - [ ] ✅ CONFIRMED: `pgjwt` extension installed (v0.2.0) - MUST REMOVE
  - [ ] ✅ DATABASE SIZE: 254 MB (~3 minutes upgrade time at 100MBps)
  - [ ] ✅ LOGICAL REPLICATION: 2 active slots found - WILL BE LOST
  - [ ] ✅ CUSTOM ROLES: Only `dashboard_user` (non-login) - MINIMAL IMPACT
  - [ ] ✅ PG_CRON: 31MB `job_run_details` table - ACCEPTABLE SIZE
- [ ] **0.2** Critical Pre-Upgrade Actions ✅ VERIFIED SAFE
  - [ ] ✅ **pgjwt USAGE ANALYSIS**: Only contains generic JWT functions (url_encode, sign, verify, etc.)
  - [ ] ✅ **APPLICATION IMPACT**: Zero - app uses Supabase's built-in `auth.jwt()` function
  - [ ] ✅ **SAFE TO REMOVE**: pgjwt extension is unused legacy code
  - [ ] **Create full database backup**: Before any extension removal or upgrade
- [ ] **0.3** Upgrade Status ⚠️ INVESTIGATING ISSUE
  - [ ] ✅ pgjwt extension successfully removed
  - [ ] ⚠️ **PROBLEM**: Upgrade button disappeared from dashboard after extension removal
  - [ ] **CURRENT**: PostgreSQL 15.8.1.054 (target was PostgreSQL 17)
  - [ ] **TROUBLESHOOTING**: Need to determine why upgrade option is no longer visible

### Phase 1: Assessment & Discovery

- [ ] **1.1** Run diagnostic queries to identify custom objects in restricted schemas
  - [ ] Check for custom tables in auth, storage, realtime schemas
  - [ ] Check for custom functions in auth, storage, realtime schemas
  - [ ] Document findings with object names and purposes
- [ ] **1.2** Review codebase for direct references to identified objects
  - [ ] Search TypeScript/React files for schema references
  - [ ] Check SQL migrations for affected objects
  - [ ] Review Edge Functions for schema dependencies
  - [ ] **CHECK RLS POLICIES** on auth/storage/realtime tables for custom object references
  - [ ] Analyze Supabase client usage patterns
- [ ] **1.3** Assess impact and categorize objects by criticality
  - [ ] Identify business-critical objects
  - [ ] Determine safe-to-migrate objects
  - [ ] Flag any complex migration scenarios

### Phase 2: Migration Strategy Development

- [ ] **2.1** Implement Supabase Migrations Best Practices
  - [ ] Initialize Supabase CLI and migrations in project
  - [ ] Set up migration workflow following [Supabase Migration Guide](https://supabase.com/docs/guides/deployment/database-migrations)
  - [ ] Configure local development environment for safe testing
- [ ] **2.2** Design target schema structure
  - [ ] Create `app_custom` schema for all migrated objects
  - [ ] Plan migration sequence: table first, then functions
  - [ ] Design rollback strategy for each migration step
- [ ] **2.3** Create migration scripts
  - [ ] **Migration 1**: Create `app_custom` schema and move `auth.redirect_urls` table
  - [ ] **Migration 2**: Recreate auth functions in `app_custom` schema
  - [ ] **Migration 3**: Recreate storage function in `app_custom` schema
  - [ ] **Migration 4**: Clean up original objects (with safety checks)
- [ ] **2.4** Verify Dashboard Dependencies
  - [ ] Test if moving `auth.redirect_urls` affects Supabase dashboard configuration
  - [ ] Document any dashboard settings that need to be reconfigured
  - [ ] Create manual verification checklist for auth flows

### Phase 3: Testing & Validation

- [ ] **3.1** Local Docker Environment Setup
  - [ ] Set up local Supabase with Docker following [Local Development Guide](https://supabase.com/docs/guides/local-development)
  - [ ] Test migration scripts in local environment
  - [ ] Validate auth flows still work (sign-in, redirects)
  - [ ] Test file upload functionality
- [ ] **3.2** Application Functionality Testing
  - [ ] Run application against local migrated database
  - [ ] Test all auth-related features (login, logout, password reset)
  - [ ] Verify Edge Functions continue to work
  - [ ] Test file upload/download flows
- [ ] **3.3** Dashboard Configuration Testing
  - [ ] Verify Supabase dashboard auth settings still work
  - [ ] Test redirect URL configurations
  - [ ] Confirm all dashboard functionality remains intact
- [ ] **3.4** Documentation and preparation
  - [ ] Document all changes and new schema structure
  - [ ] Create step-by-step deployment checklist
  - [ ] Prepare rollback procedures

### Phase 4: Production Migration

- [ ] **4.1** Pre-migration backup and preparation
  - [ ] Create full database backup
  - [ ] Schedule maintenance window if needed
  - [ ] Prepare monitoring and alerting
- [ ] **4.2** Execute migration
  - [ ] Run migration scripts in production
  - [ ] Deploy updated application code
  - [ ] Monitor for errors and performance issues
- [ ] **4.3** Post-migration validation
  - [ ] Verify all functionality works as expected
  - [ ] Monitor logs for any missed references
  - [ ] Cleanup old migration history if needed

## Discovery Results

### Custom Objects Found (REQUIRES MIGRATION)

#### Auth Schema Custom Objects

- [ ] **Table: `auth.redirect_urls`**

  - Purpose: Stores redirect URLs for user authentication flows
  - Columns: id (uuid), user_id (uuid), redirect_url (text), created_at (timestamp)
  - Foreign key to auth.users table
  - Has indexes: redirect_urls_pkey, redirect_urls_user_id_idx, redirect_urls_created_at_idx

- [ ] **Function: `auth.get_jwt_role()`**

  - Returns: text
  - Purpose: Extracts role from JWT token
  - Definition: `SELECT auth.jwt() ->> 'role'`

- [ ] **Function: `auth.get_jwt_user_role()`**
  - Returns: text
  - Purpose: Extracts user role from JWT user_metadata
  - Definition: `SELECT auth.jwt() -> 'user_metadata' ->> 'role'`

#### Storage Schema Custom Objects

- [ ] **Function: `storage.get_upload_url(bucket_name text, file_path text)`**
  - Returns: text
  - Purpose: Generates signed upload URLs with 1-hour expiration
  - Definition: Calls `storage.sign_upload_url()` with 3600 second timeout

### Codebase Analysis Results

- [ ] **Direct Usage Search**: ✅ COMPLETED

  - No direct references to custom functions found in application code
  - No direct usage of `auth.redirect_urls` table found
  - Storage upload functionality uses standard Supabase client methods
  - Custom functions appear to be **LEGACY/UNUSED**

- [ ] **SQL Scripts Analysis**: ✅ COMPLETED
  - Reviewed `scripts/recreate_six_month_cron_job.sql` - No affected objects
  - Reviewed `scripts/process_six_month_requests_manually.sql` - No affected objects
  - No migration scripts found that create the custom objects

### Impact Assessment

- **LIKELY LOW IMPACT**: Custom objects appear to be unused legacy code
- **SAFE TO MIGRATE**: No active application dependencies found
- **REQUIRES CONFIRMATION**: Need to verify these are truly unused before removal

## 🚨 **MAJOR DISCOVERY**: Postgres Upgrade Alternative

Based on [GitHub Issue Comment](https://github.com/orgs/supabase/discussions/34270), Supabase support states:

> "You can now apply the restrictions by upgrading your Postgres version via Project Settings > Infrastructure"

**This could eliminate the need for manual migration entirely!**

## ⚠️ **CRITICAL UPGRADE PITFALLS IDENTIFIED**

Based on [Supabase Upgrade Documentation](https://supabase.com/docs/guides/platform/upgrading#extensions):

1. **🚨 pgjwt Extension**: Must be removed before upgrade (already identified in dashboard)
2. **🚨 pg_cron Cleanup**: Large `cron.job_run_details` tables can cause upgrade failures
3. **🚨 Custom Roles**: Password reset required (md5 → scram-sha-256 migration)
4. **⚠️ Logical Replication**: Replication slots will be lost and need manual recreation
5. **⚠️ Disk Sizing**: Will be "right-sized" to 1.2x current database size
6. **⚠️ Downtime**: ~100MBps processing speed for upgrade duration

## Confirmed Requirements & Decisions

✅ **Timeline**: July 28th, 2025 (hard deadline from Supabase email)
✅ **Primary Strategy**: Investigate Postgres upgrade path (potentially much simpler!)
✅ **Backup Strategy**: Manual migration to `app_custom` schema if upgrade fails
✅ **Testing Environment**: Local Docker development (no staging available)
✅ **Backup Preference**: Full database dump before any changes
✅ **Object Usage**: Custom objects appear to be Supabase dashboard-created (redirect URLs) or legacy functions

## Updated Open Questions & Clarifications Needed

### Postgres Upgrade Investigation (Priority 1)

- [ ] **pgjwt Extension Usage**: ✅ IDENTIFIED - Need to determine if we're actually using this
- [ ] **pg_cron Table Size**: Critical to check `cron.job_run_details` table size before upgrade
- [ ] **Database Size Assessment**: Need to calculate downtime (~100MBps processing speed)
- [ ] **Custom Roles Impact**: Check for custom DB roles that will need password reset (md5→scram-sha-256)
- [ ] **Maintenance Window**: Plan appropriate downtime window for upgrade

### Manual Migration Fallback (Priority 2)

- [ ] **RLS Policies**: ✅ CONFIRMED - Need to check custom RLS policies on auth/storage/realtime tables
- [ ] **Dashboard Dependencies**: Need to verify impact on Supabase dashboard functionality
- [ ] **Local Docker Setup**: ✅ CONFIRMED - Assistance requested for Docker setup phase

## Risk Assessment

- **High Risk**: Custom objects in restricted schemas that are business-critical
- **Medium Risk**: Objects with complex dependencies or numerous references
- **Low Risk**: Simple objects with isolated usage

## Recommended Timeline

### Option A: Postgres Upgrade Path (PREFERRED - If Feasible)

**Total Duration**: 1-2 weeks

- **Phase 0 - Postgres Upgrade Investigation**: 2-3 days
  - Research upgrade impacts and create upgrade plan
- **Phase 0 - Production Upgrade**: 1 day
  - Execute Postgres upgrade with full backup
- **Validation & Testing**: 2-3 days
  - Verify all functionality works post-upgrade

### Option B: Manual Migration Path (FALLBACK)

**Total Duration**: 2-3 weeks to complete safely before July 28th deadline

- **Phase 1 - Discovery & Assessment**: 2-3 days
  - Complete remaining open questions and verification
- **Phase 2 - Migration Development**: 4-5 days
  - Set up Supabase migrations, create migration scripts
- **Phase 3 - Local Testing & Validation**: 5-7 days
  - Docker setup, comprehensive testing, dashboard verification
- **Phase 4 - Production Migration**: 1-2 days
  - Final deployment and validation

**Buffer Time**: 3-4 days before July 28th deadline
**Recommended Start Date**: Early July to ensure completion before deadline

## Best Practices Recommendations

### Supabase Migrations Setup

Following [Supabase Migration Best Practices](https://supabase.com/docs/guides/deployment/database-migrations):

1. **Initialize Migrations**: `supabase migration new initial_schema_migration`
2. **Use Descriptive Names**: `supabase migration new move_auth_objects_to_app_custom`
3. **Version Control**: All migration files committed to git before applying
4. **Safe Migrations**: Always test locally before production
5. **Rollback Strategy**: Each migration should have a corresponding rollback script

### Local Development with Docker

1. **Supabase CLI**: Install latest version for local development
2. **Docker Setup**: Use `supabase start` for local instance
3. **Environment Parity**: Ensure local matches production configuration
4. **Testing Workflow**: Apply migrations locally → test → apply to production

## Notes

- **NO CHANGES** to be made until plan is finalized and approved
- All findings to be documented before proceeding
- Rollback procedures to be prepared for all changes
- **Dashboard dependencies must be verified** before migration
- Local Docker testing is **mandatory** before production deployment
