The lint item titled "Exposed Auth Users" indicates that the view or materialized view named user_roles in the public schema may inadvertently expose sensitive data from the auth.users table to anonymous or authenticated users. This poses a security risk as it could allow unauthorized access to user information.
Suggested Fixes:

    Move the View to a Private Schema:
        Create a new schema called private (if it doesn't already exist) and move the user_roles view or materialized view there. This will help ensure that the view is not directly accessible via PostgREST, thus protecting the sensitive data.

SQL Query

```sql
    CREATE SCHEMA IF NOT EXISTS private;
```

Create the View with Security Invoker:

    When recreating the view in the private schema, ensure to include the WITH (security_invoker=on) clause. This will enforce that the view executes with the privileges of the user who is calling it, rather than the owner of the view.

SQL Query

```sql
    CREATE OR REPLACE VIEW private.user_roles WITH (security_invoker=on) AS
    SELECT * FROM auth.users; -- Adjust the query as necessary
```

Review and Update RLS Policies:

    Ensure that appropriate Row Level Security (RLS) policies are in place for the auth.users table and any related tables. This will help control who can access the data based on their role.

views of user_roles, sender_display_names, and admin_messages_with_names all need this fix
