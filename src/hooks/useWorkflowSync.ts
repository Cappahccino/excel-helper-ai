
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WorkflowNode, Edge } from '@/types/workflow';
import { toast } from 'sonner';
import { WorkflowUpdateType } from './useWorkflowSyncState';

/**
 * Hook to synchronize nodes and edges with the workflow definition
 * This ensures that schema propagation works correctly even for temporary workflows
 */
export function useWorkflowSync(
  workflowId: string | null,
  nodes: WorkflowNode[],
  edges: Edge[],
  isSaving: boolean,
  onSyncComplete?: () => void
) {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);
  const syncInProgressRef = useRef<boolean>(false);
  
  // Function to convert temporary workflow ID to database format
  const getDbWorkflowId = useCallback((id: string | null): string | null => {
    if (!id) return null;
    // Handle the temp- prefix correctly
    return id.startsWith('temp-') ? id.substring(5) : id;
  }, []);

  // Synchronize workflow definition with nodes and edges
  const syncWorkflowDefinition = useCallback(async (updateType: WorkflowUpdateType = WorkflowUpdateType.MINOR) => {
    if (!workflowId || syncInProgressRef.current) return false;
    
    try {
      syncInProgressRef.current = true;
      const dbWorkflowId = getDbWorkflowId(workflowId);
      if (!dbWorkflowId) {
        syncInProgressRef.current = false;
        return false;
      }
      
      // Validate UUID format before database operations
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbWorkflowId)) {
        console.error(`Invalid workflow ID format for database: ${dbWorkflowId}`);
        syncInProgressRef.current = false;
        return false;
      }
      
      // Check if workflow exists
      const { data: existingWorkflow, error: checkError } = await supabase
        .from('workflows')
        .select('id, definition, is_temporary')
        .eq('id', dbWorkflowId)
        .maybeSingle();
        
      if (checkError) {
        console.error('Error checking workflow:', checkError);
        syncInProgressRef.current = false;
        return false;
      }
      
      // If workflow exists, update the definition
      if (existingWorkflow) {
        const definition = JSON.stringify({ nodes, edges });
        
        // For schema updates, we need to ensure the workflow definition is updated
        // For structure updates, we update both definition and edges
        // For minor updates, we only update if enough time has passed
        let updateSuccess = false;
        
        if (updateType === WorkflowUpdateType.SCHEMA || 
            updateType === WorkflowUpdateType.STRUCTURE || 
            updateType === WorkflowUpdateType.FULL_SAVE) {
          const { error: updateError } = await supabase
            .from('workflows')
            .update({ definition })
            .eq('id', dbWorkflowId);
            
          if (updateError) {
            console.error('Error updating workflow definition:', updateError);
          } else {
            updateSuccess = true;
          }
          
          // For structure updates and full saves, also sync edges
          if ((updateType === WorkflowUpdateType.STRUCTURE || 
               updateType === WorkflowUpdateType.FULL_SAVE) && edges.length > 0) {
            await syncEdgesToDatabase(dbWorkflowId, edges);
          }
        } else {
          // For minor updates, check if enough time has passed since last sync
          const timeSinceLastSync = Date.now() - lastSyncRef.current;
          if (timeSinceLastSync > 30000) { // Only sync minor changes every 30 seconds
            const { error: updateError } = await supabase
              .from('workflows')
              .update({ definition })
              .eq('id', dbWorkflowId);
              
            if (updateError) {
              console.error('Error updating workflow definition:', updateError);
            } else {
              updateSuccess = true;
            }
          }
        }
        
        if (updateSuccess) {
          console.log(`Synchronized workflow definition for ${workflowId}`);
          lastSyncRef.current = Date.now();
          if (onSyncComplete) onSyncComplete();
        }
        
        syncInProgressRef.current = false;
        return updateSuccess;
      }
      
      syncInProgressRef.current = false;
      return false;
    } catch (error) {
      console.error('Error in syncWorkflowDefinition:', error);
      syncInProgressRef.current = false;
      return false;
    }
  }, [workflowId, nodes, edges, getDbWorkflowId, onSyncComplete]);

  const syncEdgesToDatabase = async (workflowId: string, edges: Edge[]) => {
    try {
      if (!edges.length) return;
      
      // Validate UUID format for database operations
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowId)) {
        console.error(`Invalid workflow ID format for database: ${workflowId}`);
        return;
      }
      
      console.log(`Syncing ${edges.length} edges for workflow ${workflowId}`);
      
      // First, delete existing edges to avoid duplicate issues
      const { error: deleteError } = await supabase
        .from('workflow_edges')
        .delete()
        .eq('workflow_id', workflowId);
      
      if (deleteError) {
        console.error('Error deleting existing edges:', deleteError);
      }
      
      // Insert new edges without using conflicting ON CONFLICT specifications
      const edgesToInsert = edges.map(edge => {
        // Extract metadata from the edge object
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
          workflow_id: workflowId,
          source_node_id: source,
          target_node_id: target,
          edge_id: id,
          edge_type: type || 'default',
          metadata
        };
      });
      
      // Use batching for large edge sets
      for (let i = 0; i < edgesToInsert.length; i += 20) {
        const batch = edgesToInsert.slice(i, i + 20);
        const { error: insertError } = await supabase
          .from('workflow_edges')
          .insert(batch);
          
        if (insertError) {
          console.error(`Error inserting edges batch ${i}-${i+20}:`, insertError);
        }
      }
      
      console.log(`Successfully synced ${edges.length} edges to database`);
    } catch (error) {
      console.error('Error in syncEdgesToDatabase:', error);
    }
  };

  // Debounced synchronization to avoid too many database calls
  const debouncedSync = useCallback((updateType: WorkflowUpdateType = WorkflowUpdateType.MINOR) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Set different delays based on update type
    let delay = 5000; // Default for minor updates
    
    if (updateType === WorkflowUpdateType.STRUCTURE) {
      delay = 2000; // Shorter delay for structural changes
    }
    
    if (updateType === WorkflowUpdateType.SCHEMA) {
      delay = 1000; // Even shorter delay for schema changes
    }
    
    if (updateType === WorkflowUpdateType.FULL_SAVE) {
      delay = 0; // No delay for full saves
    }
    
    syncTimeoutRef.current = setTimeout(() => {
      syncWorkflowDefinition(updateType);
    }, delay);
  }, [syncWorkflowDefinition]);

  // Only sync workflow definition when explicitly requested or for schema changes
  // This replaces the automatic sync on every node/edge change
  const syncWorkflow = useCallback((updateType: WorkflowUpdateType = WorkflowUpdateType.MINOR) => {
    // Don't sync while saving (avoid conflicts)
    if (isSaving) return;
    
    // Skip sync for new workflows until they're saved
    if (workflowId === 'new') return;
    
    debouncedSync(updateType);
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [debouncedSync, isSaving, workflowId]);

  // Force sync when the component unmounts
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      // Only force sync if we have a valid workflow ID and there are nodes
      if (workflowId && workflowId !== 'new' && nodes.length > 0) {
        syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE);
      }
    };
  }, [syncWorkflowDefinition, workflowId, nodes]);

  return {
    syncWorkflow,
    forceSyncNow: () => syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE),
    lastSync: lastSyncRef.current
  };
}
