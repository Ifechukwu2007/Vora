from supabase import create_client

url = 'https://bbjyfmgisxzjruqkjxlo.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJianlmbWdpc3h6anJ1cWtqeGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2Njk1NzUsImV4cCI6MjA5NDI0NTU3NX0.mF5_W7ZgMsWvb6YY0wRD2dPuAw_37TmMWP2_NkMap0E'

supabase = create_client(url, key)

try:
    response = supabase.table('information_schema.columns').select(
        'table_schema,table_name,column_name,data_type,is_nullable,column_default'
    ).eq('table_name', 'services').execute()
    print('status_code:', response.status_code)
    print('data:')
    for row in response.data or []:
        print(row)
    print('error:', response.error)
except Exception as exc:
    print('exception:', exc)
