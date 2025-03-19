
import { useEffect, useCallback, useState, useRef } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';
import { toast } from 'sonner';
import { Json } from '@/types/workflow';
import { useDebounce } from '@/hooks/useDebounce';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';
import { syncEdgesToDatabase, deduplicateEdges } from '@/utils/workflowSyncUtils';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const reactFlowInstance = useReactFlow();
  const { propagateFileSchema, isTemporaryId, convertToDbWorkflowId: contextConvertToDbId } = useWorkflow();
  const [retryMap, setRetryMap] = useState<Record<string, { attempts: number, maxAttempts: number, lastAttempt: number }>>({});
  
  const edgesRef = useRef<Edge[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const debouncedEdges = useDebounce(edges, 500);
  
  // Track successful propagations to prevent redundant operations
  const successfulPropagations = useRef<Record<string, number>>({});
  
  // Lock to prevent parallel propagations for the same edge
  const propagationInProgress = useRef<Record<string, boolean>>({});
  
  const [schemaPropagationStatus, setSchemaPropagationStatus] = useState<Record<string, {
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    message?: string;
    lastAttempt: number;
  }>>({});
  
  const edgesSavePending = useRef(false);
  const edgesSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (workflowId) {
      const isTemp = isTemporaryId(workflowId);
      const dbId = contextConvertToDbId(workflowId);
      console.log(`ConnectionHandler initialized with workflowId: ${workflowId}`);
      console.log(`Is temporary ID: ${isTemp}, Database ID: ${dbId}`);
    }
  }, [workflowId, isTemporaryId, contextConvertToDbId]);

  const saveEdgesToDatabase = useCallback(async (edgesToSave: Edge[], immediate = false) => {
    if (!workflowId) return;
    
    if (edgesSavePending.current && !immediate) return;
    
    const scheduleSave = () => {
      if (edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
      }
      
      edgesSavePending.current = true;
      edgesSaveTimeoutRef.current = setTimeout(async () => {
        try {
          const uniqueEdges = deduplicateEdges(edgesToSave);
          console.log(`Saving ${uniqueEdges.length} unique edges for workflow ${workflowId}`);
          
          const success = await syncEdgesToDatabase(workflowId, uniqueEdges);
          
          if (!success) {
            console.error('Failed to sync edges to database');
          }
          
          // Only perform post-save propagation for new edges
          const newEdges = uniqueEdges.filter(edge => {
            const edgeKey = `${edge.source}-${edge.target}`;
            return !successfulPropagations.current[edgeKey];
          });
          
          if (newEdges.length > 0) {
            console.log(`Running post-save schema propagation for ${newEdges.length} new edges`);
            for (const edge of newEdges) {
              const edgeKey = `${edge.source}-${edge.target}`;
              try {
                await propagateSchemaDirectly(
                  workflowId, 
                  edge.source, 
                  edge.target
                );
                
                // Record successful propagation with timestamp
                successfulPropagations.current[edgeKey] = Date.now();
              } catch (err) {
                console.error(`Error in post-save schema propagation for ${edge.source} -> ${edge.target}:`, err);
              }
            }
          } else {
            console.log('No new edges requiring schema propagation');
          }
        } catch (error) {
          console.error('Error in saveEdgesToDatabase:', error);
        } finally {
          edgesSavePending.current = false;
          edgesSaveTimeoutRef.current = null;
        }
      }, immediate ? 0 : 1000);
    };
    
    scheduleSave();
  }, [workflowId]);

  const propagateSchemaWithRetry = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!workflowId) return false;
    
    const edgeKey = `${sourceId}-${targetId}`;
    const now = Date.now();
    
    // Check if we're already propagating for this edge
    if (propagationInProgress.current[edgeKey]) {
      console.log(`Propagation already in progress for ${edgeKey}, skipping`);
      return false;
    }
    
    // Check if we've successfully propagated recently (within last 30 seconds)
    const lastSuccess = successfulPropagations.current[edgeKey] || 0;
    if (lastSuccess && (now - lastSuccess < 30000)) {
      console.log(`Schema already successfully propagated for ${edgeKey} ${(now - lastSuccess) / 1000}s ago, skipping`);
      return true;
    }
    
    try {
      // Mark propagation as in progress
      propagationInProgress.current[edgeKey] = true;
      
      console.log(`Attempting direct schema propagation from ${sourceId} to ${targetId} for workflow ${workflowId} (isTemp: ${isTemporaryId(workflowId)})`);
      
      const result = await propagateSchemaDirectly(workflowId, sourceId, targetId);
      
      if (result) {
        console.log(`Successfully propagated schema from ${sourceId} to ${targetId}`);
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'completed',
            lastAttempt: now
          }
        }));
        
        // Record successful propagation with timestamp
        successfulPropagations.current[edgeKey] = now;
        
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5, lastAttempt: now }
        }));
        
        return true;
      } else {
        console.warn(`Direct schema propagation returned false for ${sourceId} to ${targetId}`);
      }
    } catch (error) {
      console.error(`Direct schema propagation failed from ${sourceId} to ${targetId}:`, error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      // Clear the in-progress flag
      propagationInProgress.current[edgeKey] = false;
    }
    
    const retryInfo = retryMap[edgeKey];
    if (retryInfo) {
      const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
      const timeSinceLastAttempt = now - retryInfo.lastAttempt;
      
      if (retryInfo.attempts > 0 && timeSinceLastAttempt < backoffTime) {
        console.log(`Skipping propagation for ${edgeKey}, attempted too recently (${timeSinceLastAttempt}ms ago, backoff is ${backoffTime}ms)`);
        return false;
      }
    }
    
    try {
      // Mark propagation as in progress again for the fallback approach
      propagationInProgress.current[edgeKey] = true;
      
      console.log(`Attempting to propagate schema via context method from ${sourceId} to ${targetId} (isTemp: ${isTemporaryId(workflowId)})`);
      
      setSchemaPropagationStatus(prev => ({
        ...prev,
        [edgeKey]: {
          status: 'in_progress',
          lastAttempt: now
        }
      }));
      
      setRetryMap(prev => ({
        ...prev,
        [edgeKey]: { 
          attempts: (prev[edgeKey]?.attempts || 0), 
          maxAttempts: 5,
          lastAttempt: now
        }
      }));
      
      const result = await propagateFileSchema(sourceId, targetId);
      
      if (result) {
        console.log(`Successfully propagated schema via context method from ${sourceId} to ${targetId}`);
        
        // Record successful propagation with timestamp
        successfulPropagations.current[edgeKey] = now;
        
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5, lastAttempt: now }
        }));
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'completed',
            lastAttempt: now
          }
        }));
        
        return true;
      } else {
        console.warn(`Failed to propagate schema via context method from ${sourceId} to ${targetId}`);
        
        setRetryMap(prev => {
          const currentRetry = prev[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: now };
          return {
            ...prev,
            [edgeKey]: { 
              attempts: currentRetry.attempts + 1, 
              maxAttempts: currentRetry.maxAttempts,
              lastAttempt: now
            }
          };
        });
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'error',
            message: 'Failed to propagate schema',
            lastAttempt: now
          }
        }));
        
        return false;
      }
    } catch (error) {
      console.error(`Error propagating schema for edge ${edgeKey}:`, error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      
      setRetryMap(prev => {
        const currentRetry = prev[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: 0 };
        return {
          ...prev,
          [edgeKey]: { 
            attempts: currentRetry.attempts + 1, 
            maxAttempts: currentRetry.maxAttempts,
            lastAttempt: now
          }
        };
      });
      
      setSchemaPropagationStatus(prev => ({
        ...prev,
        [edgeKey]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          lastAttempt: now
        }
      }));
      
      return false;
    } finally {
      // Clear the in-progress flag
      propagationInProgress.current[edgeKey] = false;
    }
  }, [propagateFileSchema, retryMap, workflowId, isTemporaryId]);

  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = () => {
      const currentEdges = reactFlowInstance.getEdges();
      edgesRef.current = currentEdges;
      setEdges(currentEdges);
    };
    
    handleEdgeChanges();
    
    const intervalId = setInterval(() => {
      handleEdgeChanges();
    }, 500);
    
    return () => {
      clearInterval(intervalId);
      
      if (edgesSavePending.current && edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
        saveEdgesToDatabase(edgesRef.current, true);
      }
    };
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  useEffect(() => {
    if (!workflowId || debouncedEdges.length === 0) return;
    saveEdgesToDatabase(debouncedEdges);
  }, [debouncedEdges, workflowId, saveEdgesToDatabase]);

  useEffect(() => {
    if (!workflowId) return;
    
    const propagateSchemas = async () => {
      const currentEdges = edgesRef.current;
      
      // Sort edges to prioritize those that haven't been attempted or have fewer attempts
      const sortedEdges = [...currentEdges].sort((a, b) => {
        const keyA = `${a.source}-${a.target}`;
        const keyB = `${b.source}-${b.target}`;
        
        // Check if we've already successfully propagated
        const successA = successfulPropagations.current[keyA] || 0;
        const successB = successfulPropagations.current[keyB] || 0;
        
        // Prioritize edges that haven't been successfully propagated
        if (successA && !successB) return 1;
        if (!successA && successB) return -1;
        
        // If both have been propagated, prioritize the older one (might need refresh)
        if (successA && successB) return successA - successB;
        
        // Fall back to retry attempts
        const attemptsA = retryMap[keyA]?.attempts || 0;
        const attemptsB = retryMap[keyB]?.attempts || 0;
        return attemptsA - attemptsB;
      });
      
      for (const edge of sortedEdges) {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: 0 };
        const statusInfo = schemaPropagationStatus[edgeKey];
        
        // Skip if max retries exceeded
        if (retryInfo.attempts >= retryInfo.maxAttempts) {
          console.log(`Skipping schema propagation for ${edgeKey} after ${retryInfo.attempts} failed attempts`);
          continue;
        }
        
        // Skip if propagation is already in progress
        if (propagationInProgress.current[edgeKey]) {
          console.log(`Skipping schema propagation for ${edgeKey} - already in progress`);
          continue;
        }
        
        // Skip if status is in_progress
        if (statusInfo && statusInfo.status === 'in_progress') {
          console.log(`Skipping schema propagation for ${edgeKey} - already in progress`);
          continue;
        }
        
        // Skip if recently completed successfully (within last 30 seconds)
        const lastSuccess = successfulPropagations.current[edgeKey] || 0;
        if (lastSuccess && (Date.now() - lastSuccess < 30000)) {
          console.log(`Skipping schema propagation for ${edgeKey} - successfully propagated ${(Date.now() - lastSuccess) / 1000}s ago`);
          continue;
        }
        
        // Skip if recently completed (within last 10 seconds by status)
        if (statusInfo && statusInfo.status === 'completed' && (Date.now() - statusInfo.lastAttempt < 10000)) {
          console.log(`Skipping schema propagation for ${edgeKey} - completed ${(Date.now() - statusInfo.lastAttempt) / 1000}s ago`);
          continue;
        }
        
        try {
          setSchemaPropagationStatus(prev => ({
            ...prev,
            [edgeKey]: {
              status: 'pending',
              lastAttempt: Date.now()
            }
          }));
          
          await propagateSchemaWithRetry(edge.source, edge.target);
        } catch (error) {
          console.error(`Error propagating schema for edge from ${edge.source} to ${edge.target}:`, error);
        }
      }
    };
    
    // Initial propagation
    propagateSchemas();
    
    // Setup a less frequent interval for checking propagation needs
    const intervalId = setInterval(() => {
      const now = Date.now();
      const edgesNeedingRetry = edgesRef.current.filter(edge => {
        const edgeKey = `${edge.source}-${edge.target}`;
        
        // Skip edges with propagation in progress
        if (propagationInProgress.current[edgeKey]) {
          return false;
        }
        
        const retryInfo = retryMap[edgeKey];
        const statusInfo = schemaPropagationStatus[edgeKey];
        
        // Check if recently successful
        const lastSuccess = successfulPropagations.current[edgeKey] || 0;
        if (lastSuccess && (now - lastSuccess < 30000)) {
          return false;
        }
        
        // Check for errors that need retry with backoff
        if (statusInfo && statusInfo.status === 'error') {
          const backoffTime = Math.min(1000 * Math.pow(2, retryInfo?.attempts || 0), 30000);
          const timeSinceLastAttempt = now - (statusInfo.lastAttempt || 0);
          return timeSinceLastAttempt >= backoffTime;
        }
        
        // Retry failures with backoff
        if (retryInfo && retryInfo.attempts > 0 && retryInfo.attempts < retryInfo.maxAttempts) {
          const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
          const timeSinceLastAttempt = now - retryInfo.lastAttempt;
          return timeSinceLastAttempt >= backoffTime;
        }
        
        // Occasionally check completion status (less frequently - every 60s)
        if (statusInfo && statusInfo.status === 'completed') {
          return (now - statusInfo.lastAttempt) > 60000;
        }
        
        return false;
      });
      
      if (edgesNeedingRetry.length > 0) {
        console.log(`Rechecking schema propagation for ${edgesNeedingRetry.length} edges`);
        propagateSchemas();
      }
    }, 10000); // Check less frequently (10 seconds)
    
    return () => {
      clearInterval(intervalId);
      
      // Clean up in-progress flags
      propagationInProgress.current = {};
    };
  }, [reactFlowInstance, workflowId, propagateSchemaWithRetry, retryMap, schemaPropagationStatus]);

  return null;
};

export default ConnectionHandler;
