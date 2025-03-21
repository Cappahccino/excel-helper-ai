
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { retryOperation } from './retryUtils';

/**
 * Interface for schema recovery options
 */
interface SchemaRecoveryOptions {
  /**
   * Whether to show notifications during recovery attempts
   */
  showNotifications?: boolean;
  
  /**
   * Maximum number of retries for recovery operations
   */
  maxRetries?: number;
  
  /**
   * Sheet name to recover
   */
  sheetName?: string;
  
  /**
   * Debug mode
   */
  debug?: boolean;
}

/**
 * Interface for SchemaRecoveryResult
 */
export interface SchemaRecoveryResult {
  /**
   * Whether the recovery was successful
   */
  success: boolean;
  
  /**
   * The recovered schema if successful
   */
  schema?: SchemaColumn[];
  
  /**
   * The source of the recovered schema
   */
  source?: 'sourceNode' | 'history' | 'edgeFunction' | 'fileMetadata';
  
  /**
   * Error message if recovery failed
   */
  error?: string;
  
  /**
   * Whether the schema validation was successful
   */
  isValid?: boolean;
  
  /**
   * Debug information if requested
   */
  debugInfo?: any;
}

/**
 * Recover schema for a node through various fallback mechanisms
 */
export async function recoverNodeSchema(
  workflowId: string,
  nodeId: string,
  sourceNodeId?: string,
  options: SchemaRecoveryOptions = {}
): Promise<SchemaRecoveryResult> {
  const {
    showNotifications = true,
    maxRetries = 3,
    sheetName,
    debug = false
  } = options;
  
  try {
    if (showNotifications) {
      toast.info('Attempting to recover schema...');
    }
    
    if (debug) {
      console.log(`Recovering schema for node ${nodeId} from ${sourceNodeId || 'history'}`);
    }
    
    // First try to recover using edge function
    const result = await retryOperation(
      async () => {
        const { data, error } = await supabase.functions.invoke('schemaRecovery', {
          body: {
            operation: 'recover',
            workflowId,
            nodeId,
            sourceNodeId,
            sheetName
          }
        });
        
        if (error) throw error;
        return data;
      },
      { maxRetries }
    );
    
    if (result?.data?.recovered) {
      if (showNotifications) {
        toast.success('Successfully recovered schema');
      }
      
      return {
        success: true,
        schema: result.data.schema,
        source: result.data.source,
        debugInfo: debug ? result : undefined
      };
    }
    
    // If edge function couldn't recover, fall back to direct DB query
    // (This is a simplified version, would need real implementation)
    if (debug) {
      console.log('Edge function recovery failed, attempting direct recovery');
    }
    
    // Report failure
    if (showNotifications) {
      toast.error('Unable to recover schema');
    }
    
    return {
      success: false,
      error: result?.data?.reason || 'Unknown error in schema recovery',
      debugInfo: debug ? result : undefined
    };
  } catch (error) {
    console.error('Error in recoverNodeSchema:', error);
    
    if (showNotifications) {
      toast.error('Schema recovery failed');
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validate schema consistency for a node
 */
export async function validateNodeSchema(
  workflowId: string,
  nodeId: string,
  options: SchemaRecoveryOptions = {}
): Promise<{ isValid: boolean; details?: any; error?: string }> {
  const {
    showNotifications = false,
    maxRetries = 2,
    sheetName,
    debug = false
  } = options;
  
  try {
    if (debug) {
      console.log(`Validating schema for node ${nodeId}`);
    }
    
    const result = await retryOperation(
      async () => {
        const { data, error } = await supabase.functions.invoke('schemaRecovery', {
          body: {
            operation: 'validate',
            workflowId,
            nodeId,
            sheetName
          }
        });
        
        if (error) throw error;
        return data;
      },
      { maxRetries }
    );
    
    if (!result?.data) {
      return { 
        isValid: false,
        error: 'No validation data returned'
      };
    }
    
    if (!result.data.valid && showNotifications) {
      toast.warning('Schema validation found inconsistencies');
    }
    
    return {
      isValid: result.data.valid === true,
      details: result.data,
      error: result.data.reason
    };
  } catch (error) {
    console.error('Error in validateNodeSchema:', error);
    
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Sync schema between nodes using edge function
 */
export async function syncNodeSchemas(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options: SchemaRecoveryOptions = {}
): Promise<{ success: boolean; error?: string; details?: any }> {
  const {
    showNotifications = true,
    maxRetries = 3,
    sheetName,
    debug = false
  } = options;
  
  try {
    if (showNotifications) {
      toast.info('Synchronizing schemas...');
    }
    
    if (debug) {
      console.log(`Syncing schemas: ${sourceNodeId} -> ${targetNodeId}`);
    }
    
    const result = await retryOperation(
      async () => {
        const { data, error } = await supabase.functions.invoke('schemaRecovery', {
          body: {
            operation: 'sync',
            workflowId,
            nodeId: targetNodeId,
            sourceNodeId,
            sheetName
          }
        });
        
        if (error) throw error;
        return data;
      },
      { maxRetries }
    );
    
    if (result?.data?.success) {
      if (showNotifications) {
        toast.success('Schemas synchronized successfully');
      }
      
      return {
        success: true,
        details: result.data
      };
    }
    
    if (showNotifications) {
      toast.error('Schema synchronization failed');
    }
    
    return {
      success: false,
      error: 'Schema synchronization failed'
    };
  } catch (error) {
    console.error('Error in syncNodeSchemas:', error);
    
    if (showNotifications) {
      toast.error('Schema synchronization failed');
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get debug information for a node
 */
export async function getNodeDebugInfo(
  workflowId: string,
  nodeId: string,
  options: { 
    includeSystemInfo?: boolean;
    metadata?: Record<string, any>;
  } = {}
): Promise<{ success: boolean; debugInfo?: any; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('schemaRecovery', {
      body: {
        operation: 'debug',
        workflowId,
        nodeId,
        metadata: {
          includeSystemInfo: options.includeSystemInfo,
          clientInfo: {
            timestamp: new Date().toISOString(),
            userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
            ...options.metadata
          }
        }
      }
    });
    
    if (error) throw error;
    
    return {
      success: true,
      debugInfo: data?.data
    };
  } catch (error) {
    console.error('Error in getNodeDebugInfo:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
