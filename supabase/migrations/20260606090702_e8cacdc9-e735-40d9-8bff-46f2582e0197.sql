SELECT cron.schedule(
  'calibration-fit-nightly',
  '17 2 * * *',
  $$ SELECT net.http_post(
       url := 'https://reprphurmjtveejeqejn.supabase.co/functions/v1/calibration-fit',
       headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcHJwaHVybWp0dmVlamVxZWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjMxMTksImV4cCI6MjA4NzQzOTExOX0.uMlwSCcAwvKnA5vX3zo1R-bn3zIshFq9vSZeM4ni1eU"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);