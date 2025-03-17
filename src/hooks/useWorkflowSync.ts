
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WorkflowNode, Edge } from '@/types/workflow';
import { toast } from 'sonner';

/**
 * Hook to synchronize nodes and edges with the workflow definition
 * This ensures that schema propagation works correctly even for temporary workflows
 */
export function useWorkflowSync(
  workflowId: string | null,
  nodes: WorkflowNode[],
  edges: Edge[],
  isSaving: boolean
) {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);
  
  // Function to convert temporary workflow ID to database format
  const getDbWorkflowId = useCallback((id: string | null): string | null => {
    if (!id) return null;
    return id.startsWith('temp-') ? id.substring(5) : id;
  }, []);

  // Synchronize workflow definition with nodes and edges
  const syncWorkflowDefinition = useCallback(async () => {
    if (!workflowId) return;
    
    try {
      const dbWorkflowId = getDbWorkflowId(workflowId);
      if (!dbWorkflowId) return;
      
      // Check if workflow exists
      const { data: existingWorkflow, error: checkError } = await supabase
        .from('workflows')
        .select('id, definition, is_temporary')
        .eq('id', dbWorkflowId)
        .maybeSingle();
        
      if (checkError) {
        console.error('Error checking workflow:', checkError);
        return;
      }
      
      // If workflow exists, update the definition
      if (existingWorkflow) {
        const definition = JSON.stringify({ nodes, edges });
        
        const { error: updateError } = await supabase
          .from('workflows')
          .update({ definition })
          .eq('id', dbWorkflowId);
          
        if (updateError) {
          console.error('Error updating workflow definition:', updateError);
        } else {
          console.log(`Synchronized workflow definition for ${workflowId}`);
          lastSyncRef.current = Date.now();
        }
      }
    } catch (error) {
      console.error('Error in syncWorkflowDefinition:', error);
    }
  }, [workflowId, nodes, edges, getDbWorkflowId]);

  // Debounced synchronization to avoid too many database calls
  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Don't sync if we've synced recently (within 5 seconds)
    const timeSinceLastSync = Date.now() - lastSyncRef.current;
    if (timeSinceLastSync < 5000) {
      syncTimeoutRef.current = setTimeout(debouncedSync, 5000 - timeSinceLastSync);
      return;
    }
    
    syncTimeoutRef.current = setTimeout(() => {
      syncWorkflowDefinition();
    }, 1000);
  }, [syncWorkflowDefinition]);

  // Sync workflow definition whenever nodes or edges change
  useEffect(() => {
    if (isSaving) return; // Don't sync while saving (avoid conflicts)
    
    debouncedSync();
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [nodes, edges, debouncedSync, isSaving]);

  // Force sync when the component unmounts
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncWorkflowDefinition();
    };
  }, [syncWorkflowDefinition]);

  return {
    syncWorkflowDefinition,
    lastSync: lastSyncRef.current
  };
}
