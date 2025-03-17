
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { 
  getNodeSchema, 
  getNodeSelectedSheet, 
  getNodeSheets,
  setNodeSelectedSheet,
  triggerSchemaRefresh,
  SheetMetadata
} from '@/utils/fileSchemaUtils';
import { 
  propagateSchemaWithRetry,
  validateSchemaForFiltering
} from '@/utils/schemaPropagation';
import { toast } from 'sonner';
import { invalidateSchemaCache } from '@/utils/schemaCache';

/**
 * Custom hook for managing file schema and propagation
 */
export function useFileSchemaManagement(
  workflowId: string | null,
  nodeId: string,
  fileId?: string,
  options?: {
    autoPropagate?: boolean;
    showNotifications?: boolean;
  }
) {
  const {
    autoPropagate = true,
    showNotifications = true
  } = options || {};
  
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>();
  const [availableSheets, setAvailableSheets] = useState<SheetMetadata[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  
  const [connectedNodes, setConnectedNodes] = useState<string[]>([]);
  const [isPropagating, setIsPropagating] = useState(false);
  
  // Get connected downstream nodes
  const fetchConnectedNodes = useCallback(async () => {
    if (!workflowId || !nodeId) return;
    
    try {
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
        
      const { data, error } = await supabase
        .from('workflow_edges')
        .select('target_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', nodeId);
        
      if (error) {
        console.error('Error fetching connected nodes:', error);
        return;
      }
      
      if (data) {
        const targetNodeIds = data.map(edge => edge.target_node_id);
        setConnectedNodes(targetNodeIds);
        console.log(`Found ${targetNodeIds.length} connected nodes for ${nodeId}`);
      }
    } catch (error) {
      console.error('Error in fetchConnectedNodes:', error);
    }
  }, [workflowId, nodeId]);
  
  // Load sheets for the file
  const loadSheets = useCallback(async () => {
    if (!workflowId || !nodeId) return;
    
    setIsLoadingSheets(true);
    
    try {
      // Get sheets from metadata
      const sheets = await getNodeSheets(workflowId, nodeId);
      
      if (sheets && sheets.length > 0) {
        setAvailableSheets(sheets);
        console.log(`Loaded ${sheets.length} sheets for node ${nodeId}`);
        
        // Get selected sheet
        const currentSheet = await getNodeSelectedSheet(workflowId, nodeId);
        
        if (currentSheet) {
          setSelectedSheet(currentSheet);
        } else {
          // Default to first sheet if none selected
          const defaultSheet = sheets.find(s => s.isDefault) || sheets[0];
          setSelectedSheet(defaultSheet.name);
          
          // Save selection
          await setNodeSelectedSheet(workflowId, nodeId, defaultSheet.name);
        }
      } else {
        setAvailableSheets([]);
        setSelectedSheet(undefined);
      }
    } catch (error) {
      console.error('Error loading sheets:', error);
    } finally {
      setIsLoadingSheets(false);
    }
  }, [workflowId, nodeId]);
  
  // Load schema for current sheet
  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflowId || !nodeId || !selectedSheet) return;
    
    setIsLoadingSchema(true);
    setSchemaError(null);
    
    try {
      const result = await getNodeSchema(workflowId, nodeId, {
        forceRefresh,
        sheetName: selectedSheet
      });
      
      if (result && result.columns && result.data_types) {
        const schemaColumns = result.columns.map((col: string) => ({
          name: col,
          type: result.data_types[col] || 'unknown'
        }));
        
        setSchema(schemaColumns);
        console.log(`Loaded schema with ${schemaColumns.length} columns`);
      } else {
        if (forceRefresh) {
          // If forced refresh failed, try triggering schema refresh
          console.log('Forced refresh failed, triggering schema processing...');
          await triggerSchemaRefresh(workflowId, nodeId, {
            sheetName: selectedSheet,
            forceProcessing: true
          });
          
          // Wait a bit and try once more
          setTimeout(async () => {
            const retryResult = await getNodeSchema(workflowId, nodeId, {
              forceRefresh: true,
              sheetName: selectedSheet
            });
            
            if (retryResult && retryResult.columns) {
              const retrySchema = retryResult.columns.map((col: string) => ({
                name: col,
                type: retryResult.data_types[col] || 'unknown'
              }));
              
              setSchema(retrySchema);
              setSchemaError(null);
            } else {
              setSchema([]);
              setSchemaError('Unable to load schema after refresh');
            }
            
            setIsLoadingSchema(false);
          }, 2000);
          return;
        } else {
          setSchema([]);
          setSchemaError('No schema available');
        }
      }
    } catch (error) {
      console.error('Error loading schema:', error);
      setSchema([]);
      setSchemaError((error as Error).message);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [workflowId, nodeId, selectedSheet]);
  
  // Propagate schema to connected nodes
  const propagateSchemaToConnectedNodes = useCallback(async () => {
    if (!workflowId || !nodeId || !selectedSheet || connectedNodes.length === 0) return;
    
    setIsPropagating(true);
    
    if (showNotifications) {
      toast.info(`Updating schema for ${connectedNodes.length} connected node(s)...`);
    }
    
    try {
      let successCount = 0;
      
      // Process each connected node
      for (const targetNodeId of connectedNodes) {
        console.log(`Propagating schema to ${targetNodeId}`);
        
        const success = await propagateSchemaWithRetry(workflowId, nodeId, targetNodeId, {
          sheetName: selectedSheet,
          maxRetries: 2
        });
        
        if (success) {
          successCount++;
        }
      }
      
      if (showNotifications) {
        if (successCount === connectedNodes.length) {
          toast.success(`Schema updated for all ${successCount} node(s)`);
        } else {
          toast.warning(`Schema updated for ${successCount} of ${connectedNodes.length} node(s)`);
        }
      }
      
      return successCount === connectedNodes.length;
    } catch (error) {
      console.error('Error propagating schema:', error);
      
      if (showNotifications) {
        toast.error('Error updating connected nodes');
      }
      
      return false;
    } finally {
      setIsPropagating(false);
    }
  }, [workflowId, nodeId, selectedSheet, connectedNodes, showNotifications]);
  
  // Handle sheet selection
  const selectSheet = useCallback(async (sheetName: string) => {
    if (!workflowId || !nodeId || sheetName === selectedSheet) return;
    
    setSelectedSheet(sheetName);
    
    try {
      // Save selection
      await setNodeSelectedSheet(workflowId, nodeId, sheetName);
      
      // Invalidate schema cache
      invalidateSchemaCache(workflowId, nodeId);
      
      // Load schema for new sheet
      await loadSchema(true);
      
      // Propagate schema with new sheet if auto-propagate is enabled
      if (autoPropagate && connectedNodes.length > 0) {
        setTimeout(() => {
          propagateSchemaToConnectedNodes();
        }, 500);
      }
    } catch (error) {
      console.error('Error selecting sheet:', error);
      if (showNotifications) {
        toast.error('Failed to update sheet selection');
      }
    }
  }, [workflowId, nodeId, selectedSheet, loadSchema, autoPropagate, 
      connectedNodes, propagateSchemaToConnectedNodes, showNotifications]);
  
  // Initial data loading
  useEffect(() => {
    if (workflowId && nodeId && fileId) {
      fetchConnectedNodes();
      loadSheets();
    }
  }, [workflowId, nodeId, fileId, fetchConnectedNodes, loadSheets]);
  
  // Load schema when sheet is selected
  useEffect(() => {
    if (selectedSheet) {
      loadSchema();
    }
  }, [selectedSheet, loadSchema]);
  
  // Force refresh schema
  const refreshSchema = useCallback(async () => {
    if (!workflowId || !nodeId || !selectedSheet) return false;
    
    try {
      if (showNotifications) {
        toast.info('Refreshing schema...');
      }
      
      // Invalidate cache
      invalidateSchemaCache(workflowId, nodeId, selectedSheet);
      
      // Load schema with force refresh
      await loadSchema(true);
      
      // Propagate to connected nodes
      if (connectedNodes.length > 0) {
        await propagateSchemaToConnectedNodes();
      }
      
      if (showNotifications) {
        toast.success('Schema refreshed successfully');
      }
      
      return true;
    } catch (error) {
      console.error('Error refreshing schema:', error);
      
      if (showNotifications) {
        toast.error('Failed to refresh schema');
      }
      
      return false;
    }
  }, [workflowId, nodeId, selectedSheet, loadSchema, 
      connectedNodes, propagateSchemaToConnectedNodes, showNotifications]);
  
  // Get filtered schema for specific operations
  const getFilteringSchema = useCallback(() => {
    return validateSchemaForFiltering(schema);
  }, [schema]);
  
  return {
    // Sheet management
    selectedSheet,
    availableSheets,
    isLoadingSheets,
    selectSheet,
    
    // Schema management
    schema,
    isLoadingSchema,
    schemaError,
    loadSchema,
    refreshSchema,
    getFilteringSchema,
    
    // Propagation
    connectedNodes,
    isPropagating,
    propagateSchemaToConnectedNodes
  };
}
