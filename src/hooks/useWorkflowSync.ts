
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [pendingChanges, setPendingChanges] = useState<boolean>(false);
  const changesQueuedAt = useRef<number>(0);
  const initialSyncDone = useRef<boolean>(false);
  const syncInProgressRef = useRef<boolean>(false);
  
  // Function to convert temporary workflow ID to database format
  const getDbWorkflowId = useCallback((id: string | null): string | null => {
    if (!id) return null;
    return id.startsWith('temp-') ? id.substring(5) : id;
  }, []);

  // Synchronize workflow definition with nodes and edges
  const syncWorkflowDefinition = useCallback(async (force: boolean = false) => {
    if (!workflowId) return;
    
    // Skip for new workflows until they're saved
    if (workflowId === 'new') {
      console.log('Skipping sync for new workflow that has not been saved yet');
      setPendingChanges(false);
      return;
    }
    
    // Prevent concurrent syncs
    if (syncInProgressRef.current && !force) {
      console.log('Sync already in progress, queuing changes');
      return;
    }
    
    syncInProgressRef.current = true;
    
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
          setPendingChanges(false);
        }
      }
    } catch (error) {
      console.error('Error in syncWorkflowDefinition:', error);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [workflowId, nodes, edges, getDbWorkflowId]);

  // Queue changes for synchronization - this marks that changes need to be saved
  // but doesn't immediately trigger a save
  const queueChangesForSync = useCallback(() => {
    if (!workflowId || workflowId === 'new') return;
    
    changesQueuedAt.current = Date.now();
    setPendingChanges(true);
  }, [workflowId]);

  // Debounced synchronization to avoid too many database calls
  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Don't sync if we've synced recently (within 5 seconds)
    const timeSinceLastSync = Date.now() - lastSyncRef.current;
    if (timeSinceLastSync < 5000 && !pendingChanges) {
      return;
    }
    
    // Use a longer delay for initial sync after changes
    const delay = pendingChanges && lastSyncRef.current === 0 ? 3000 : 2000;
    
    syncTimeoutRef.current = setTimeout(() => {
      if (pendingChanges && !syncInProgressRef.current && !isSaving) {
        syncWorkflowDefinition();
      }
    }, delay);
  }, [syncWorkflowDefinition, pendingChanges, isSaving]);

  // Sync workflow definition whenever nodes or edges change
  useEffect(() => {
    if (isSaving) return; // Don't sync while saving (avoid conflicts)
    
    // Don't sync for brand new workflows until they are saved
    if (workflowId === 'new') return;
    
    // Skip the first change for existing workflows to avoid unnecessary sync on mount
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      return;
    }
    
    // Mark changes for sync but don't sync immediately
    queueChangesForSync();
    debouncedSync();
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [nodes, edges, debouncedSync, isSaving, workflowId, queueChangesForSync]);

  // Force sync when the component unmounts
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      if (pendingChanges && workflowId && workflowId !== 'new') {
        console.log('Forcing workflow sync on unmount');
        syncWorkflowDefinition(true);
      }
    };
  }, [syncWorkflowDefinition, pendingChanges, workflowId]);

  return {
    syncWorkflowDefinition,
    hasPendingChanges: pendingChanges,
    queueChangesForSync,
    lastSync: lastSyncRef.current
  };
}
