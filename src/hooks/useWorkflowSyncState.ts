
import { useState, useCallback, useRef } from 'react';
import { WorkflowNode, Edge } from '@/types/workflow';
import { toast } from 'sonner';

export enum WorkflowUpdateType {
  MINOR = 'minor', // Small updates that don't need immediate syncing (position changes, etc.)
  SCHEMA = 'schema', // Schema-related updates that need immediate syncing
  STRUCTURE = 'structure', // Adding/removing nodes or connections
  FULL_SAVE = 'full_save' // User-requested save or critical changes
}

export interface SyncState {
  pendingChanges: boolean;
  lastSyncTime: number;
  syncInProgress: boolean;
}

/**
 * Hook to manage workflow sync state and control when to trigger actual database operations
 * This separates state updates from persistence operations to prevent race conditions
 */
export function useWorkflowSyncState(
  workflowId: string | null,
  initialNodes: WorkflowNode[] = [],
  initialEdges: Edge[] = []
) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [syncState, setSyncState] = useState<SyncState>({
    pendingChanges: false,
    lastSyncTime: 0,
    syncInProgress: false
  });
  
  // Use refs to track latest state without triggering re-renders
  const nodesRef = useRef<WorkflowNode[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const pendingUpdatesRef = useRef<Set<WorkflowUpdateType>>(new Set());
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update refs when state changes
  nodesRef.current = nodes;
  edgesRef.current = edges;
  
  /**
   * Update workflow state without necessarily triggering a sync operation
   */
  const updateWorkflowState = useCallback((
    newNodes: WorkflowNode[] | ((prev: WorkflowNode[]) => WorkflowNode[]),
    newEdges: Edge[] | ((prev: Edge[]) => Edge[]),
    updateType: WorkflowUpdateType = WorkflowUpdateType.MINOR
  ) => {
    // Update nodes state
    setNodes(prev => {
      const updatedNodes = typeof newNodes === 'function' ? newNodes(prev) : newNodes;
      return updatedNodes;
    });
    
    // Update edges state
    setEdges(prev => {
      const updatedEdges = typeof newEdges === 'function' ? newEdges(prev) : newEdges;
      return updatedEdges;
    });
    
    // Track the update type
    pendingUpdatesRef.current.add(updateType);
    
    // Mark that we have pending changes
    setSyncState(prev => ({
      ...prev,
      pendingChanges: true
    }));
    
    // For SCHEMA and STRUCTURE updates, schedule a sync if one isn't already scheduled
    if ((updateType === WorkflowUpdateType.SCHEMA || 
         updateType === WorkflowUpdateType.STRUCTURE) && 
        !syncTimeoutRef.current) {
      scheduleSync();
    }
  }, []);
  
  /**
   * Schedule a sync operation with debouncing
   */
  const scheduleSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Determine sync delay based on update types
    let syncDelay = 5000; // Default: 5 seconds for minor changes
    
    if (pendingUpdatesRef.current.has(WorkflowUpdateType.STRUCTURE)) {
      syncDelay = 2000; // 2 seconds for structure changes
    }
    
    if (pendingUpdatesRef.current.has(WorkflowUpdateType.SCHEMA)) {
      syncDelay = 1000; // 1 second for schema changes
    }
    
    if (pendingUpdatesRef.current.has(WorkflowUpdateType.FULL_SAVE)) {
      syncDelay = 0; // Immediate for full saves
    }
    
    syncTimeoutRef.current = setTimeout(() => {
      if (syncState.syncInProgress) {
        // If a sync is already in progress, reschedule
        syncTimeoutRef.current = setTimeout(scheduleSync, 1000);
        return;
      }
      
      const hasImportantUpdates = 
        pendingUpdatesRef.current.has(WorkflowUpdateType.SCHEMA) ||
        pendingUpdatesRef.current.has(WorkflowUpdateType.STRUCTURE) ||
        pendingUpdatesRef.current.has(WorkflowUpdateType.FULL_SAVE);
        
      // Determine if we should sync now based on time since last sync
      const timeSinceLastSync = Date.now() - syncState.lastSyncTime;
      const shouldSync = 
        hasImportantUpdates || // Important updates always sync
        timeSinceLastSync > 10000; // Minor updates sync after 10 seconds
      
      if (shouldSync) {
        triggerSync();
      } else if (syncState.pendingChanges) {
        // Reschedule if we still have pending changes
        syncTimeoutRef.current = setTimeout(scheduleSync, 1000);
      }
    }, syncDelay);
  }, [syncState]);
  
  /**
   * Trigger the actual sync with the database
   */
  const triggerSync = useCallback(() => {
    if (!workflowId || !syncState.pendingChanges || syncState.syncInProgress) {
      return;
    }
    
    setSyncState(prev => ({
      ...prev,
      syncInProgress: true
    }));
    
    // This is where we would call the actual sync function
    // For now, we just reset the sync state after a simulated operation
    const hasFullSave = pendingUpdatesRef.current.has(WorkflowUpdateType.FULL_SAVE);
    
    // Clear pending updates
    pendingUpdatesRef.current.clear();
    
    // Update sync state
    setSyncState({
      pendingChanges: false,
      lastSyncTime: Date.now(),
      syncInProgress: false
    });
    
    if (hasFullSave) {
      console.log('Full workflow save completed');
    } else {
      console.log('Workflow sync completed');
    }
    
    // Clear the timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, [workflowId, syncState]);
  
  /**
   * Request a full save of the workflow
   */
  const requestFullSave = useCallback(() => {
    pendingUpdatesRef.current.add(WorkflowUpdateType.FULL_SAVE);
    scheduleSync();
    return true;
  }, [scheduleSync]);
  
  // Clean up on unmount
  const cleanup = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    if (syncState.pendingChanges) {
      triggerSync();
    }
  }, [syncState.pendingChanges, triggerSync]);
  
  return {
    nodes,
    edges,
    updateWorkflowState,
    syncState,
    requestFullSave,
    cleanup
  };
}
