
import { supabase } from '@/integrations/supabase/client';
import { Edge } from '@/types/workflow';
import { retryOperation } from '@/utils/retryUtils';

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
 * Deduplicate edges to prevent constraint violations
 * The workflow_edges table has a unique constraint on (workflow_id, source_node_id, target_node_id)
 */
export const deduplicateEdges = (edges: Edge[]): Edge[] => {
  const uniqueEdgeMap = new Map<string, Edge>();
  
  edges.forEach(edge => {
    const key = `${edge.source}:${edge.target}`;
    // Either add the edge, or replace it with a newer one if it exists
    uniqueEdgeMap.set(key, edge);
  });
  
  return Array.from(uniqueEdgeMap.values());
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
    
    // Deduplicate edges to avoid constraint violations
    const uniqueEdges = deduplicateEdges(edges);
    
    console.log(`Syncing ${uniqueEdges.length} unique edges for workflow ${workflowId} (DB ID: ${dbWorkflowId})`);
    
    // First, delete existing edges to avoid duplicate issues
    const { error: deleteError } = await supabase
      .from('workflow_edges')
      .delete()
      .eq('workflow_id', dbWorkflowId);
    
    if (deleteError) {
      console.error('Error deleting existing edges:', deleteError);
      return false;
    }
    
    // Prepare edges to insert
    const edgesToInsert = uniqueEdges.map(edge => {
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
    
    // Use batching with retry for large edge sets
    let success = true;
    let successCount = 0;
    let failureCount = 0;
    
    // Process in smaller batches to reduce likelihood of constraint violations
    for (let i = 0; i < edgesToInsert.length; i += 10) {
      const batch = edgesToInsert.slice(i, i + 10);
      
      try {
        // Use upsert with ON CONFLICT DO NOTHING to handle any remaining duplicates gracefully
        const { error: batchError } = await retryOperation(
          async () => {
            return await supabase
              .from('workflow_edges')
              .upsert(batch, { 
                onConflict: 'workflow_id,source_node_id,target_node_id',
                ignoreDuplicates: true
              });
          },
          {
            maxRetries: 3,
            delay: 500,
            backoff: 2,
            onRetry: (error, attempt) => {
              console.warn(`Retry ${attempt} for edges batch ${i}-${i+10}: ${error.message}`);
            }
          }
        );
        
        if (batchError) {
          console.error(`Error inserting edges batch ${i}-${i+batch.length}:`, batchError);
          failureCount += batch.length;
          
          // Try to insert edges one by one as a fallback
          for (const edge of batch) {
            const { error: singleEdgeError } = await supabase
              .from('workflow_edges')
              .upsert([edge], { 
                onConflict: 'workflow_id,source_node_id,target_node_id',
                ignoreDuplicates: true 
              });
              
            if (!singleEdgeError) {
              successCount++;
            } else {
              failureCount++;
              console.error('Error inserting single edge:', singleEdgeError, edge);
            }
          }
        } else {
          successCount += batch.length;
        }
      } catch (error) {
        console.error(`Exception in batch ${i}-${i+batch.length}:`, error);
        failureCount += batch.length;
        success = false;
      }
    }
    
    if (successCount > 0) {
      console.log(`Successfully synced ${successCount}/${edgesToInsert.length} edges to database`);
    }
    
    if (failureCount > 0) {
      console.warn(`Failed to sync ${failureCount}/${edgesToInsert.length} edges to database`);
    }
    
    // Consider it a success if at least some edges were synced
    return successCount > 0;
  } catch (error) {
    console.error('Error in syncEdgesToDatabase:', error);
    return false;
  }
};
