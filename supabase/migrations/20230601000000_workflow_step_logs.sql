
-- Create enum for log status
CREATE TYPE log_status AS ENUM ('success', 'error', 'warning', 'info');

-- Create a table for workflow step execution logs
CREATE TABLE IF NOT EXISTS workflow_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL,
  execution_id UUID NOT NULL,
  workflow_id UUID,
  node_type TEXT NOT NULL,
  input_data JSONB,
  output_data JSONB,
  processing_metadata JSONB,
  status log_status NOT NULL DEFAULT 'success',
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_workflow_step_logs_execution_id ON workflow_step_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_logs_node_id ON workflow_step_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_logs_workflow_id ON workflow_step_logs(workflow_id);

-- Add a function to clean up old logs (optional, to prevent table from growing too large)
CREATE OR REPLACE FUNCTION cleanup_old_workflow_logs() 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete logs older than 30 days
  DELETE FROM workflow_step_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Comment on the table and columns
COMMENT ON TABLE workflow_step_logs IS 'Stores execution logs for each workflow step';
COMMENT ON COLUMN workflow_step_logs.input_data IS 'Input data received by the step';
COMMENT ON COLUMN workflow_step_logs.output_data IS 'Output data produced by the step';
COMMENT ON COLUMN workflow_step_logs.processing_metadata IS 'Additional metadata about the step execution';
COMMENT ON COLUMN workflow_step_logs.status IS 'Execution status (success, error, warning, info)';
COMMENT ON COLUMN workflow_step_logs.execution_time_ms IS 'Time taken to execute the step in milliseconds';
