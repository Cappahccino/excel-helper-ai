
-- Enable tables for real-time subscriptions
ALTER TABLE public.workflow_file_schemas REPLICA IDENTITY FULL;
ALTER TABLE public.workflow_edges REPLICA IDENTITY FULL;
ALTER TABLE public.workflow_files REPLICA IDENTITY FULL;
ALTER TABLE public.excel_files REPLICA IDENTITY FULL;
ALTER TABLE public.file_metadata REPLICA IDENTITY FULL;

-- Add these tables to the realtime publication
BEGIN;
  -- Create the publication if it doesn't exist
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;

  -- Add tables to the publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_file_schemas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_edges;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_files;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.excel_files;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.file_metadata;
COMMIT;
