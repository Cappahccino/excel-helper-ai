
-- Create a function to check if a node has logs
CREATE OR REPLACE FUNCTION check_node_logs(node_id_param TEXT)
RETURNS TABLE(has_logs BOOLEAN) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT EXISTS (
    SELECT 1 FROM workflow_step_logs
    WHERE node_id = node_id_param
    LIMIT 1
  );
END;
$$;
