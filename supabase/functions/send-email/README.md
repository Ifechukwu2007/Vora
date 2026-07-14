# send-email Edge Function

This Edge Function sends email using Resend and the `RESEND_API_KEY` secret.

## Deploy

Use the Supabase CLI from the project root:

```bash
supabase functions deploy send-email
```

## Use

POST JSON to the function URL with:

- `to` — recipient email address
- `subject` — email subject
- `html` or `text` — email body
