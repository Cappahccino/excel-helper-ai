
import { useCallback, useEffect, useRef } from 'react';
import { WorkflowNode, Edge } from '@/types/workflow';
import { toast } from 'sonner';
import { WorkflowUpdateType } from './useWorkflowSyncState';
import { useWorkflowSyncDebounce } from './useWorkflowSyncDebounce';
import { syncEdgesToDatabase, getDbWorkflowId, isValidUuid } from '@/utils/workflowSyncUtils';
import { supabase } from '@/integrations/supabase/client';

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
  const lastSyncRef = useRef<number>(0);
  const syncInProgressRef = useRef<boolean>(false);
  
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
      if (!isValidUuid(dbWorkflowId)) {
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
            await syncEdgesToDatabase(workflowId, edges);
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
  }, [workflowId, nodes, edges, onSyncComplete]);

  // Use the debounce hook for sync timing
  const { 
    syncWorkflow, 
    clearSyncTimeout,
    syncTimeoutRef 
  } = useWorkflowSyncDebounce(syncWorkflowDefinition, isSaving, workflowId);

  // Force sync when the component unmounts
  useEffect(() => {
    return () => {
      clearSyncTimeout();
      
      // Only force sync if we have a valid workflow ID and there are nodes
      if (workflowId && workflowId !== 'new' && nodes.length > 0) {
        syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE);
      }
    };
  }, [clearSyncTimeout, syncWorkflowDefinition, workflowId, nodes]);

  return {
    syncWorkflow,
    forceSyncNow: () => syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE),
    lastSync: lastSyncRef.current
  };
}
