
import { useState, useCallback } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { recoverNodeSchema, validateNodeSchema, syncNodeSchemas, getNodeDebugInfo, SchemaRecoveryResult } from '@/utils/schemaRecovery';

/**
 * Recovery strategy options
 */
export enum RecoveryStrategy {
  AUTO = 'auto',
  SOURCE_NODE = 'sourceNode',
  HISTORY = 'history',
  METADATA = 'metadata',
  EDGE_FUNCTION = 'edgeFunction'
}

/**
 * Options for useSchemaRecovery hook
 */
interface SchemaRecoveryOptions {
  /**
   * Whether to automatically attempt recovery on errors
   */
  autoRecover?: boolean;
  
  /**
   * Whether to show notifications
   */
  showNotifications?: boolean;
  
  /**
   * Preferred recovery strategy
   */
  preferredStrategy?: RecoveryStrategy;
  
  /**
   * Debug mode
   */
  debug?: boolean;
}

/**
 * Custom hook for schema recovery and monitoring
 */
export function useSchemaRecovery(
  workflowId: string | null,
  nodeId: string,
  sourceNodeId: string | null | undefined,
  options: SchemaRecoveryOptions = {}
) {
  const {
    autoRecover = true,
    showNotifications = true,
    preferredStrategy = RecoveryStrategy.AUTO,
    debug = false
  } = options;
  
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<SchemaRecoveryResult | null>(null);
  const [validationStatus, setValidationStatus] = useState<{ 
    isValid: boolean; 
    checked: boolean;
    details?: any;
  }>({ isValid: true, checked: false });
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  /**
   * Attempt to recover schema from various sources
   */
  const recoverSchema = useCallback(async (
    strategy?: RecoveryStrategy,
    customOptions?: {
      sheetName?: string;
      fromSourceId?: string;
    }
  ) => {
    if (!workflowId) return { success: false, error: 'No workflow ID provided' };
    
    setIsRecovering(true);
    
    try {
      const effectiveStrategy = strategy || preferredStrategy;
      const effectiveSourceId = customOptions?.fromSourceId || sourceNodeId;
      
      // For most strategies, we just call the recoverNodeSchema function
      // which handles the edge function fallback internally
      const result = await recoverNodeSchema(
        workflowId,
        nodeId,
        effectiveStrategy === RecoveryStrategy.SOURCE_NODE ? effectiveSourceId || undefined : undefined,
        {
          showNotifications,
          sheetName: customOptions?.sheetName,
          debug
        }
      );
      
      setRecoveryResult(result);
      return result;
    } catch (error) {
      console.error('Error in recoverSchema:', error);
      
      if (showNotifications) {
        toast.error('Schema recovery failed');
      }
      
      setRecoveryResult({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      setIsRecovering(false);
    }
  }, [workflowId, nodeId, sourceNodeId, preferredStrategy, showNotifications, debug]);
  
  /**
   * Validate schema consistency for a node
   */
  const validateSchema = useCallback(async (sheetName?: string) => {
    if (!workflowId) return { isValid: false, error: 'No workflow ID provided' };
    
    try {
      const result = await validateNodeSchema(workflowId, nodeId, {
        showNotifications,
        sheetName,
        debug
      });
      
      setValidationStatus({
        isValid: result.isValid,
        checked: true,
        details: result.details
      });
      
      // If auto recovery is enabled and validation failed, attempt recovery
      if (autoRecover && !result.isValid && sourceNodeId) {
        recoverSchema(RecoveryStrategy.SOURCE_NODE, { sheetName });
      }
      
      return result;
    } catch (error) {
      console.error('Error in validateSchema:', error);
      
      setValidationStatus({
        isValid: false,
        checked: true,
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [workflowId, nodeId, sourceNodeId, autoRecover, showNotifications, debug, recoverSchema]);
  
  /**
   * Sync schema between nodes
   */
  const syncSchema = useCallback(async (sheetName?: string) => {
    if (!workflowId || !sourceNodeId) {
      return { success: false, error: 'Workflow ID or source node ID missing' };
    }
    
    try {
      return await syncNodeSchemas(workflowId, sourceNodeId, nodeId, {
        showNotifications,
        sheetName,
        debug
      });
    } catch (error) {
      console.error('Error in syncSchema:', error);
      
      if (showNotifications) {
        toast.error('Schema synchronization failed');
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [workflowId, nodeId, sourceNodeId, showNotifications, debug]);
  
  /**
   * Get debug information for troubleshooting
   */
  const getDebugInfo = useCallback(async (includeSystemInfo: boolean = false) => {
    if (!workflowId) return { success: false, error: 'No workflow ID provided' };
    
    try {
      const result = await getNodeDebugInfo(workflowId, nodeId, { 
        includeSystemInfo,
        metadata: {
          sourceNodeId,
          recoveryEnabled: autoRecover,
          preferredStrategy
        }
      });
      
      if (result.success && result.debugInfo) {
        setDebugInfo(result.debugInfo);
      }
      
      return result;
    } catch (error) {
      console.error('Error in getDebugInfo:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [workflowId, nodeId, sourceNodeId, autoRecover, preferredStrategy]);
  
  return {
    // Async functions
    recoverSchema,
    validateSchema,
    syncSchema,
    getDebugInfo,
    
    // State
    isRecovering,
    recoveryResult,
    validationStatus,
    debugInfo,
    
    // Helper properties
    hasValidSchema: validationStatus.isValid,
    lastRecoverySuccess: recoveryResult?.success,
    recoveredSchema: recoveryResult?.schema,
    recoverySource: recoveryResult?.source,
    recoveryError: recoveryResult?.error
  };
}
