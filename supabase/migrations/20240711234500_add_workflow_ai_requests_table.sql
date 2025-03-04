
-- Create the workflow_ai_requests table if it doesn't exist already
CREATE TABLE IF NOT EXISTS workflow_ai_requests (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  execution_id UUID NOT NULL,
  ai_provider TEXT NOT NULL,
  user_query TEXT NOT NULL,
  ai_response TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  model_name TEXT,
  token_usage JSONB,
  metadata JSONB,
  system_message TEXT
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS workflow_ai_requests_workflow_id_idx ON workflow_ai_requests(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_ai_requests_node_id_idx ON workflow_ai_requests(node_id);
CREATE INDEX IF NOT EXISTS workflow_ai_requests_execution_id_idx ON workflow_ai_requests(execution_id);
CREATE INDEX IF NOT EXISTS workflow_ai_requests_status_idx ON workflow_ai_requests(status);
