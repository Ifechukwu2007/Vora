import os
from supabase import create_client, Client

# Supabase credentials
supabase_url = 'https://bbjyfmgisxzjruqkjxlo.supabase.co'
supabase_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJianlmbWdpc3h6anJ1cWtqeGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2Njk1NzUsImV4cCI6MjA5NDI0NTU3NX0.mF5_W7ZgMsWvb6YY0wRD2dPuAw_37TmMWP2_NkMap0E'

supabase: Client = create_client(supabase_url, supabase_key)

def check_users_table():
    try:
        # Try to select from users table to see if it exists
        response = supabase.table('users').select('*').limit(1).execute()
        print("Users table exists. Sample data:", response.data)

        # Check schema by describing the table (this might not work directly)
        # Supabase doesn't have a direct describe, but we can try to insert and see columns
        # For now, let's try to query the information_schema if possible
        # Actually, let's try to get the table info via RPC or direct query

        # Try to get column info
        columns_query = """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND table_schema = 'public'
        ORDER BY ordinal_position;
        """

        result = supabase.rpc('execute_sql', {'query': columns_query}).execute()
        print("Users table columns:")
        for col in result.data:
            print(f"  {col['column_name']}: {col['data_type']} ({'NOT NULL' if col['is_nullable'] == 'NO' else 'NULL'})")

    except Exception as e:
        print(f"Error checking users table: {e}")

if __name__ == "__main__":
    check_users_table()