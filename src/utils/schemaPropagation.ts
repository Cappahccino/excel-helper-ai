
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { supabase } from '@/integrations/supabase/client';
import { cacheSchema, getSchemaFromCache } from '@/utils/schema';
import { standardizeColumnType } from './schemaStandardization';

/**
 * Options for schema propagation
 */
interface PropagationOptions {
  sheetName?: string;
  maxRetries?: number;
  retryDelay?: number;
  forceRefresh?: boolean;
}

/**
 * Propagate schema from source node to target node with retry mechanism
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options: PropagationOptions = {}
): Promise<boolean> {
  const {
    sheetName,
    maxRetries = 3,
    retryDelay = 1000,
    forceRefresh = false
  } = options;
  
  let retryCount = 0;
  
  const attemptPropagation = async (): Promise<boolean> => {
    try {
      // Try to use edge function for propagation
      const { data, error } = await supabase.functions.invoke('schemaPropagation', {
        body: {
          action: 'propagate',
          workflowId,
          sourceNodeId,
          targetNodeId,
          sheetName,
          forceRefresh
        }
      });
      
      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }
      
      if (data?.success) {
        return true;
      }
      
      // If edge function doesn't work, fall back to manual propagation
      // Get source schema
      const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, {
        sheetName,
        maxAge: forceRefresh ? 0 : 30000
      });
      
      if (!sourceSchema || sourceSchema.length === 0) {
        throw new Error('Source schema not available');
      }
      
      // Cache in target node
      await cacheSchema(workflowId, targetNodeId, sourceSchema, {
        source: 'propagation',
        sheetName
      });
      
      return true;
    } catch (error) {
      console.error(`Propagation attempt ${retryCount + 1} failed:`, error);
      
      if (retryCount < maxRetries) {
        retryCount++;
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
        return attemptPropagation();
      }
      
      return false;
    }
  };
  
  return attemptPropagation();
}

/**
 * Validate schema for filtering operations
 * Ensures all columns have valid types for filtering
 */
export function validateSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  if (!schema || !Array.isArray(schema)) {
    return [];
  }
  
  return schema.filter(column => {
    // Standardize the type
    const standardType = standardizeColumnType(column.type);
    
    // Only include columns with types that can be filtered
    return ['string', 'number', 'date', 'boolean'].includes(standardType);
  });
}
