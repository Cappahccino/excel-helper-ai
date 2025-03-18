
import { useCallback, useRef } from 'react';
import { WorkflowUpdateType } from './useWorkflowSyncState';

/**
 * Hook for handling debounced workflow synchronization
 */
export function useWorkflowSyncDebounce(
  syncCallback: (updateType: WorkflowUpdateType) => Promise<boolean>,
  isSaving: boolean,
  workflowId: string | null
) {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
      syncCallback(updateType);
    }, delay);
  }, [syncCallback]);

  // Hook to request sync with proper debouncing
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

  // Clear timeout on cleanup
  const clearSyncTimeout = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, []);

  return {
    syncWorkflow,
    debouncedSync,
    clearSyncTimeout,
    syncTimeoutRef
  };
}
