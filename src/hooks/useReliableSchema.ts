
import { useState, useCallback, useEffect, useMemo } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useSchemaPropagation } from './useSchemaPropagation';
import { useSchemaFallback, FallbackStatus } from './useSchemaFallback';

/**
 * Options for the useReliableSchema hook
 */
interface ReliableSchemaOptions {
  /**
   * Whether to use fallback mechanisms when schema propagation fails
   */
  useFallback?: boolean;
  
  /**
   * Whether to check for schema consistency on mount
   */
  validateOnMount?: boolean;
  
  /**
   * Maximum number of retries for operations
   */
  maxRetries?: number;
  
  /**
   * Whether to show notifications
   */
  showNotifications?: boolean;
  
  /**
   * The sheet name to use
   */
  sheetName?: string;
  
  /**
   * Whether to automatically propagate schema on connection
   */
  autoPropagateOnConnection?: boolean;
  
  /**
   * Debug mode
   */
  debug?: boolean;
}

/**
 * Hook that combines schema propagation with fallback mechanisms
 * for highly reliable schema management
 */
export function useReliableSchema(
  workflowId: string | null,
  nodeId: string,
  sourceNodeId: string | null | undefined,
  options: ReliableSchemaOptions = {}
) {
  const {
    useFallback = true,
    validateOnMount = true,
    maxRetries = 3,
    showNotifications = true,
    sheetName,
    autoPropagateOnConnection = true,
    debug = false
  } = options;
  
  // Use the primary schema propagation hook
  const propagation = useSchemaPropagation(workflowId, nodeId, sourceNodeId, {
    shouldRefresh: false,
    sheetName,
    maxRetries,
    autoPropagateOnConnection,
    showNotifications,
    subscribeToUpdates: true
  });
  
  // Use the fallback hook if enabled
  const fallback = useSchemaFallback(
    useFallback ? workflowId : null, // Only enable if useFallback is true
    nodeId,
    sourceNodeId,
    propagation.schema,
    {
      autoCheckOnMount: validateOnMount,
      checkInterval: null, // No interval checking, we'll trigger manually
      maxRetries,
      sheetName,
      showNotifications,
      debug
    }
  );
  
  // Determine the effective schema to use
  const effectiveSchema = useMemo(() => {
    if (propagation.schema && propagation.schema.length > 0) {
      return propagation.schema;
    }
    
    if (useFallback && fallback.fallbackSchema && fallback.fallbackSchema.length > 0) {
      return fallback.fallbackSchema;
    }
    
    return [];
  }, [propagation.schema, useFallback, fallback.fallbackSchema]);
  
  // Check if we need recovery when propagation fails
  useEffect(() => {
    if (
      useFallback && 
      propagation.hasError && 
      fallback.status !== FallbackStatus.CHECKING && 
      fallback.status !== FallbackStatus.RECOVERING
    ) {
      fallback.checkAndRecover();
    }
  }, [useFallback, propagation.hasError, fallback.status, fallback.checkAndRecover]);
  
  // Function to refresh schema with fallback
  const refreshSchemaWithFallback = useCallback(async () => {
    try {
      const result = await propagation.refreshSchema();
      
      if (!result && useFallback) {
        return await fallback.checkAndRecover();
      }
      
      return result;
    } catch (error) {
      console.error('Error in refreshSchemaWithFallback:', error);
      
      if (useFallback) {
        return await fallback.checkAndRecover();
      }
      
      return false;
    }
  }, [propagation.refreshSchema, useFallback, fallback.checkAndRecover]);
  
  // Combined state for easy consumption
  const state = useMemo(() => {
    return {
      isLoading: propagation.isPropagating || fallback.isChecking || fallback.isRecovering,
      hasError: propagation.hasError && (!useFallback || fallback.status === FallbackStatus.FAILED),
      error: propagation.hasError ? propagation.error : fallback.error,
      usingFallback: fallback.isUsingFallback,
      schema: effectiveSchema,
      lastUpdated: propagation.lastUpdated || fallback.lastCheck,
      isValidated: !useFallback || fallback.status !== FallbackStatus.IDLE
    };
  }, [
    propagation.isPropagating, propagation.hasError, propagation.error, propagation.lastUpdated,
    fallback.isChecking, fallback.isRecovering, fallback.status, fallback.error, 
    fallback.isUsingFallback, fallback.lastCheck,
    effectiveSchema, useFallback
  ]);
  
  return {
    // Combined state
    ...state,
    
    // Main operations
    refreshSchema: refreshSchemaWithFallback,
    propagateSchema: propagation.propagateSchema,
    
    // From propagation
    getSchema: propagation.getSchema,
    synchronizeSheets: propagation.synchronizeSheets,
    isSubscribed: propagation.isSubscribed,
    checkPropagationNeeded: propagation.checkPropagationNeeded,
    
    // From fallback
    checkAndRecover: fallback.checkAndRecover,
    fallbackSchema: fallback.fallbackSchema,
    
    // Advanced access to underlying hooks if needed
    propagation,
    fallback: useFallback ? fallback : undefined
  };
}
