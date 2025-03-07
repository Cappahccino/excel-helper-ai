
-- Add indices for performance
CREATE INDEX IF NOT EXISTS workflow_edges_source_target_idx 
ON public.workflow_edges(workflow_id, source_node_id, target_node_id);

CREATE INDEX IF NOT EXISTS workflow_file_schemas_node_idx 
ON public.workflow_file_schemas(workflow_id, node_id);

CREATE INDEX IF NOT EXISTS workflow_files_node_idx 
ON public.workflow_files(workflow_id, node_id);
