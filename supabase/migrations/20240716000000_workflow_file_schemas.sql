
-- Create workflow_file_schemas table to store file structure information
CREATE TABLE IF NOT EXISTS workflow_file_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES excel_files(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  columns TEXT[] DEFAULT ARRAY[]::TEXT[],
  headers TEXT[] DEFAULT ARRAY[]::TEXT[],
  preview_data JSONB DEFAULT NULL,
  selected_sheet TEXT DEFAULT NULL,
  row_count INTEGER DEFAULT NULL,
  data_types JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (workflow_id, file_id, node_id)
);

-- Create an index for faster lookups by workflow_id
CREATE INDEX IF NOT EXISTS idx_workflow_file_schemas_workflow_id ON workflow_file_schemas (workflow_id);

-- Create an index for faster lookups by file_id
CREATE INDEX IF NOT EXISTS idx_workflow_file_schemas_file_id ON workflow_file_schemas (file_id);

-- Add a trigger to update the updated_at timestamp
CREATE TRIGGER workflow_file_schemas_updated_at
BEFORE UPDATE ON workflow_file_schemas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
