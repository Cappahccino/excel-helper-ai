
import { useState, useCallback, useEffect } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { useSchemaRecovery, RecoveryStrategy } from './useSchemaRecovery';
import { retryOperation } from '@/utils/retryUtils';

/**
 * Fallback status for schema operations
 */
export enum FallbackStatus {
  IDLE = 'idle',
  CHECKING = 'checking',
  RECOVERING = 'recovering',
  FAILED = 'failed',
  SUCCESS = 'success'
}

/**
 * Options for useSchemaFallback hook
 */
interface SchemaFallbackOptions {
  /**
   * Whether to automatically check and recover on mount
   */
  autoCheckOnMount?: boolean;
  
  /**
   * Interval in ms to check for schema consistency
   */
  checkInterval?: number | null;
  
  /**
   * Maximum number of retries
   */
  maxRetries?: number;
  
  /**
   * Sheet name to focus on
   */
  sheetName?: string;
  
  /**
   * Show notifications for fallback operations
   */
  showNotifications?: boolean;
  
  /**
   * Debug mode
   */
  debug?: boolean;
}

/**
 * Custom hook for schema fallback and recovery management
 */
export function useSchemaFallback(
  workflowId: string | null,
  nodeId: string,
  sourceNodeId: string | null | undefined,
  schema: SchemaColumn[] | undefined,
  options: SchemaFallbackOptions = {}
) {
  const {
    autoCheckOnMount = true,
    checkInterval = null,
    maxRetries = 3,
    sheetName,
    showNotifications = true,
    debug = false
  } = options;
  
  const [status, setStatus] = useState<FallbackStatus>(FallbackStatus.IDLE);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [fallbackSchema, setFallbackSchema] = useState<SchemaColumn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Use the schema recovery hook
  const {
    recoverSchema,
    validateSchema,
    syncSchema,
    isRecovering,
    recoveryResult,
    validationStatus,
    recoveredSchema
  } = useSchemaRecovery(workflowId, nodeId, sourceNodeId, {
    autoRecover: false, // We'll handle recovery timing ourselves
    showNotifications,
    preferredStrategy: RecoveryStrategy.AUTO,
    debug
  });
  
  /**
   * Check if schema is valid and recover if needed
   */
  const checkAndRecover = useCallback(async () => {
    if (!workflowId) {
      setError('No workflow ID provided');
      return { success: false, error: 'No workflow ID provided' };
    }
    
    try {
      setStatus(FallbackStatus.CHECKING);
      
      // First check if we have a schema already
      if (schema && schema.length > 0) {
        if (debug) {
          console.log(`Schema exists with ${schema.length} columns, validating consistency`);
        }
        
        // Validate existing schema
        const validationResult = await validateSchema(sheetName);
        setLastCheck(new Date());
        
        if (validationResult.isValid) {
          setStatus(FallbackStatus.SUCCESS);
          return { success: true };
        }
        
        // Schema is invalid, proceed to recovery
        if (debug) {
          console.log('Schema validation failed, attempting recovery');
        }
      } else if (debug) {
        console.log('No schema provided, attempting recovery');
      }
      
      // Attempt recovery
      setStatus(FallbackStatus.RECOVERING);
      
      const recoveryResult = await retryOperation(
        () => recoverSchema(RecoveryStrategy.AUTO, { sheetName }),
        { maxRetries }
      );
      
      if (recoveryResult.success && recoveryResult.schema) {
        setFallbackSchema(recoveryResult.schema);
        setStatus(FallbackStatus.SUCCESS);
        setError(null);
        return { success: true, schema: recoveryResult.schema };
      }
      
      // If we have a source node, try synchronization as a last resort
      if (sourceNodeId) {
        if (debug) {
          console.log('Recovery failed, attempting schema sync');
        }
        
        const syncResult = await syncSchema(sheetName);
        
        if (syncResult.success) {
          // Validate after sync
          const validationAfterSync = await validateSchema(sheetName);
          
          if (validationAfterSync.isValid) {
            setStatus(FallbackStatus.SUCCESS);
            setError(null);
            // We don't have the schema directly, but validation passed
            return { success: true };
          }
        }
      }
      
      // All recovery attempts failed
      setStatus(FallbackStatus.FAILED);
      setError(recoveryResult.error || 'Schema recovery failed');
      return recoveryResult;
    } catch (error) {
      console.error('Error in checkAndRecover:', error);
      
      setStatus(FallbackStatus.FAILED);
      setError(error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [workflowId, nodeId, sourceNodeId, schema, sheetName, debug, maxRetries, validateSchema, recoverSchema, syncSchema]);
  
  // Auto check on mount
  useEffect(() => {
    if (autoCheckOnMount && workflowId && nodeId) {
      checkAndRecover();
    }
  }, [autoCheckOnMount, workflowId, nodeId, checkAndRecover]);
  
  // Set up interval check if requested
  useEffect(() => {
    if (!checkInterval || !workflowId || !nodeId) return;
    
    const interval = setInterval(() => {
      if (status !== FallbackStatus.CHECKING && status !== FallbackStatus.RECOVERING) {
        checkAndRecover();
      }
    }, checkInterval);
    
    return () => clearInterval(interval);
  }, [checkInterval, workflowId, nodeId, status, checkAndRecover]);
  
  // Update fallback schema when recovery result changes
  useEffect(() => {
    if (recoveredSchema) {
      setFallbackSchema(recoveredSchema);
    }
  }, [recoveredSchema]);
  
  return {
    // Async operations
    checkAndRecover,
    
    // State
    status,
    isChecking: status === FallbackStatus.CHECKING,
    isRecovering: status === FallbackStatus.RECOVERING,
    lastCheck,
    fallbackSchema,
    error,
    
    // Helper properties
    needsFallback: !schema || schema.length === 0 || !validationStatus.isValid,
    hasFallbackSchema: !!fallbackSchema && fallbackSchema.length > 0,
    isUsingFallback: (!schema || schema.length === 0) && !!fallbackSchema && fallbackSchema.length > 0,
    
    // Underlying recovery state
    recoveryState: {
      isRecovering,
      recoveryResult,
      validationStatus
    }
  };
}
