
import { useState, useEffect, useCallback } from 'react';
import { getNodeSchema, convertToSchemaColumns, findSourceNodes, getFileUploadSource } from '@/utils/fileSchemaUtils';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { propagateSchemaFromSources } from '@/utils/schemaPropagation';
import { useSchemaSubscription } from './useSchemaSubscription';
import { toast } from 'sonner';

/**
 * Custom hook for loading schema with enhanced error handling and retries
 */
export function useSchemaLoader({
  workflowId,
  nodeId,
  sheetName,
  enabled = true,
  autoRetry = true,
  maxRetries = 3,
  retryDelay = 1000,
  onSchemaLoaded
}: {
  workflowId: string | null;
  nodeId: string;
  sheetName?: string;
  enabled?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  onSchemaLoaded?: (schema: SchemaColumn[]) => void;
}) {
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error' | 'retrying'>('idle');
  const [attemptCount, setAttemptCount] = useState(0);
  const [sourceNodeInfo, setSourceNodeInfo] = useState<{ nodeId: string; selectedSheet: string | null } | null>(null);
  
  // Subscribe to schema changes
  const { isSubscribed } = useSchemaSubscription({
    workflowId,
    nodeId, 
    sheetName,
    enabled,
    onSchemaChange: () => {
      console.log('Schema change detected, reloading...');
      loadSchema(true);
    }
  });
  
  const findSourceNodeInfo = useCallback(async () => {
    if (!workflowId) return null;
    
    try {
      const source = await getFileUploadSource(workflowId, nodeId);
      if (source) {
        console.log(`Found source file upload node ${source.nodeId} with sheet ${source.selectedSheet || 'not selected'}`);
        setSourceNodeInfo(source);
        return source;
      }
      return null;
    } catch (err) {
      console.error('Error finding source node:', err);
      return null;
    }
  }, [workflowId, nodeId]);
  
  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflowId || !nodeId || !enabled) return;
    
    setIsLoading(true);
    setLoadState('loading');
    setError(null);
    
    // Use the provided sheet name or try to get from source node
    let effectiveSheetName = sheetName;
    
    if (!effectiveSheetName) {
      // Check if we already have source node info
      if (sourceNodeInfo?.selectedSheet) {
        effectiveSheetName = sourceNodeInfo.selectedSheet;
      } else {
        // Try to find source node and its selected sheet
        const source = await findSourceNodeInfo();
        if (source?.selectedSheet) {
          effectiveSheetName = source.selectedSheet;
        }
      }
    }
    
    console.log(`Loading schema for ${nodeId} with sheet ${effectiveSheetName || 'default'}`);
    
    try {
      // Attempt to get schema
      const result = await getNodeSchema(workflowId, nodeId, {
        forceRefresh,
        sheetName: effectiveSheetName
      });
      
      if (result) {
        const columns = convertToSchemaColumns(result);
        setSchema(columns);
        setLoadState('loaded');
        setAttemptCount(0);
        
        if (onSchemaLoaded) {
          onSchemaLoaded(columns);
        }
        
        console.log(`Successfully loaded schema for ${nodeId}`);
      } else {
        console.warn(`No schema found for ${nodeId}, sheet ${effectiveSheetName || 'default'}`);
        
        // Try to propagate schema from source nodes if this is first attempt
        if (attemptCount === 0) {
          console.log('Attempting to propagate schema from source nodes...');
          const propagated = await propagateSchemaFromSources(workflowId, nodeId);
          
          if (propagated) {
            console.log('Schema successfully propagated, retrying load...');
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadSchema(true);
            return;
          }
        }
        
        // Handle retry logic
        if (autoRetry && attemptCount < maxRetries) {
          setLoadState('retrying');
          setAttemptCount(prev => prev + 1);
          
          console.log(`Retrying schema load (${attemptCount + 1}/${maxRetries})...`);
          setTimeout(() => loadSchema(true), retryDelay * Math.pow(2, attemptCount));
        } else {
          setError(`Schema not available. Please ensure a file is uploaded and processed.`);
          setLoadState('error');
          
          if (attemptCount >= maxRetries) {
            console.error(`Failed to load schema after ${maxRetries} attempts`);
          }
        }
      }
    } catch (err) {
      console.error('Error loading schema:', err);
      setError(err instanceof Error ? err.message : 'Unknown error loading schema');
      setLoadState('error');
      
      // Handle retry logic for errors
      if (autoRetry && attemptCount < maxRetries) {
        setLoadState('retrying');
        setAttemptCount(prev => prev + 1);
        setTimeout(() => loadSchema(true), retryDelay * Math.pow(2, attemptCount));
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    workflowId, 
    nodeId, 
    enabled, 
    sheetName, 
    sourceNodeInfo, 
    attemptCount, 
    maxRetries,
    retryDelay,
    autoRetry,
    onSchemaLoaded,
    findSourceNodeInfo
  ]);
  
  // Load schema on initial render or when dependencies change
  useEffect(() => {
    if (enabled) {
      loadSchema();
    }
  }, [enabled, loadSchema]);
  
  // Find source node information on mount
  useEffect(() => {
    if (enabled && !sourceNodeInfo) {
      findSourceNodeInfo();
    }
  }, [enabled, findSourceNodeInfo, sourceNodeInfo]);
  
  const retryLoading = useCallback(() => {
    setAttemptCount(0);
    loadSchema(true);
  }, [loadSchema]);
  
  return {
    schema,
    isLoading,
    error,
    loadState,
    retryLoading,
    isSubscribed,
    sourceNodeInfo,
    attemptCount,
    refresh: () => loadSchema(true)
  };
}
