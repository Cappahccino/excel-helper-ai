
import { useCallback, useEffect, useRef } from 'react';
import { WorkflowNode, Edge } from '@/types/workflow';
import { toast } from 'sonner';
import { WorkflowUpdateType } from './useWorkflowSyncState';
import { useWorkflowSyncDebounce } from './useWorkflowSyncDebounce';
import { syncEdgesToDatabase, getDbWorkflowId, isValidUuid, deduplicateEdges } from '@/utils/workflowSyncUtils';
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
  const scheduledSyncRef = useRef<NodeJS.Timeout | null>(null);
  const savePendingRef = useRef<boolean>(false);
  
  // Synchronize workflow definition with nodes and edges
  const syncWorkflowDefinition = useCallback(async (updateType: WorkflowUpdateType = WorkflowUpdateType.MINOR) => {
    if (!workflowId || syncInProgressRef.current) return false;
    
    try {
      // Set sync in progress flag to prevent concurrent syncs
      syncInProgressRef.current = true;
      savePendingRef.current = false;
      
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
        // Deduplicate edges before saving to prevent constraint violations
        const uniqueEdges = deduplicateEdges(edges);
        const definition = JSON.stringify({ nodes, edges: uniqueEdges });
        
        // For schema updates, we need to ensure the workflow definition is updated
        // For structure updates, we update both definition and edges
        // For minor updates, we only update if enough time has passed
        let updateSuccess = false;
        
        // Calculate time since last sync to avoid too frequent updates
        const timeSinceLastSync = Date.now() - lastSyncRef.current;
        
        // Different sync strategies based on update type
        if (updateType === WorkflowUpdateType.SCHEMA || 
            updateType === WorkflowUpdateType.STRUCTURE || 
            updateType === WorkflowUpdateType.FULL_SAVE) {
          console.log(`Performing ${updateType} sync for workflow ${workflowId}`);
          
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
               updateType === WorkflowUpdateType.FULL_SAVE) && uniqueEdges.length > 0) {
            await syncEdgesToDatabase(workflowId, uniqueEdges);
          }
        } else {
          // For minor updates, check if enough time has passed since last sync
          if (timeSinceLastSync > 30000) { // Only sync minor changes every 30 seconds
            console.log(`Performing minor sync for workflow ${workflowId} (${timeSinceLastSync / 1000}s since last sync)`);
            
            const { error: updateError } = await supabase
              .from('workflows')
              .update({ definition })
              .eq('id', dbWorkflowId);
              
            if (updateError) {
              console.error('Error updating workflow definition:', updateError);
            } else {
              updateSuccess = true;
            }
          } else {
            // Schedule a sync for later if time threshold not met
            if (scheduledSyncRef.current) {
              clearTimeout(scheduledSyncRef.current);
            }
            
            if (!savePendingRef.current) {
              savePendingRef.current = true;
              
              const delay = 30000 - timeSinceLastSync;
              console.log(`Scheduling workflow sync in ${delay / 1000}s`);
              
              scheduledSyncRef.current = setTimeout(() => {
                syncWorkflowDefinition(WorkflowUpdateType.MINOR);
              }, delay);
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
      
      // Clean up any scheduled syncs
      if (scheduledSyncRef.current) {
        clearTimeout(scheduledSyncRef.current);
        scheduledSyncRef.current = null;
      }
      
      // Only force sync if we have a valid workflow ID and there are nodes
      if (workflowId && workflowId !== 'new' && nodes.length > 0) {
        // Bypass the in-progress flag for unmount sync
        syncInProgressRef.current = false;
        syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE);
      }
    };
  }, [clearSyncTimeout, syncWorkflowDefinition, workflowId, nodes]);

  // Schedule periodic cleanup to ensure sync happens even if debounce doesn't trigger
  useEffect(() => {
    if (!workflowId || workflowId === 'new') return;
    
    const intervalId = setInterval(() => {
      const timeSinceLastSync = Date.now() - lastSyncRef.current;
      
      // If there's a pending save and no sync has happened in 30 seconds, force one
      if (savePendingRef.current && timeSinceLastSync > 30000) {
        console.log('Forcing delayed sync due to inactivity');
        syncWorkflowDefinition(WorkflowUpdateType.MINOR);
      }
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [workflowId, syncWorkflowDefinition]);

  return {
    syncWorkflow,
    forceSyncNow: () => syncWorkflowDefinition(WorkflowUpdateType.FULL_SAVE),
    lastSync: lastSyncRef.current,
    isPending: savePendingRef.current
  };
}
