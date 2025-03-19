
import { supabase } from '@/integrations/supabase/client';
import { Edge } from '@/types/workflow';

/**
 * Convert temporary workflow ID to database format
 */
export const getDbWorkflowId = (id: string | null): string | null => {
  if (!id) return null;
  // Handle the temp- prefix correctly
  return id.startsWith('temp-') ? id.substring(5) : id;
};

/**
 * Validate if a string is a valid UUID for database operations
 */
export const isValidUuid = (id: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

/**
 * Synchronize workflow edges with the database
 */
export const syncEdgesToDatabase = async (workflowId: string, edges: Edge[]): Promise<boolean> => {
  try {
    if (!edges.length) return true;
    
    // Convert temp ID if needed and validate UUID format
    const dbWorkflowId = getDbWorkflowId(workflowId);
    
    if (!dbWorkflowId || !isValidUuid(dbWorkflowId)) {
      console.error(`Invalid workflow ID format for database: ${dbWorkflowId}`);
      return false;
    }
    
    console.log(`Syncing ${edges.length} edges for workflow ${workflowId} (DB ID: ${dbWorkflowId})`);
    
    // First, delete existing edges to avoid duplicate issues
    const { error: deleteError } = await supabase
      .from('workflow_edges')
      .delete()
      .eq('workflow_id', dbWorkflowId);
    
    if (deleteError) {
      console.error('Error deleting existing edges:', deleteError);
      return false;
    }
    
    // Insert new edges
    const edgesToInsert = edges.map(edge => {
      const { id, source, target, type, sourceHandle, targetHandle, label, animated, data, ...rest } = edge;
      
      // Build metadata object
      const metadata: Record<string, any> = {};
      if (sourceHandle) metadata.sourceHandle = sourceHandle;
      if (targetHandle) metadata.targetHandle = targetHandle;
      if (label) metadata.label = label;
      if (animated) metadata.animated = animated;
      if (data) metadata.data = data;
      if (Object.keys(rest).length > 0) Object.assign(metadata, rest);
      
      return {
        workflow_id: dbWorkflowId,
        source_node_id: source,
        target_node_id: target,
        edge_id: id,
        edge_type: type || 'default',
        metadata
      };
    });
    
    // Use batching for large edge sets
    let success = true;
    for (let i = 0; i < edgesToInsert.length; i += 20) {
      const batch = edgesToInsert.slice(i, i + 20);
      const { error: insertError } = await supabase
        .from('workflow_edges')
        .insert(batch);
        
      if (insertError) {
        console.error(`Error inserting edges batch ${i}-${i+20}:`, insertError);
        success = false;
      }
    }
    
    if (success) {
      console.log(`Successfully synced ${edges.length} edges to database`);
    }
    
    return success;
  } catch (error) {
    console.error('Error in syncEdgesToDatabase:', error);
    return false;
  }
};
