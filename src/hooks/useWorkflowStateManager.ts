
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/types/common';

export type UpdateType = 
  | 'node_config' 
  | 'node_position' 
  | 'node_data' 
  | 'edge_data' 
  | 'file_schema'
  | 'node_metadata';

export interface UpdateOperation {
  type: UpdateType;
  data: any;
  priority?: number;
  timestamp: number;
}

// Define a type for valid workflow ID values
export type WorkflowId = string | number | null | undefined;

// Properly handle workflow ID validation
function isValidWorkflowIdString(value: WorkflowId): value is string {
  return typeof value === 'string' && 
         value !== '' &&
         value !== 'new';
}

// Helper function to safely convert a value to a string
function safeToString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Handle different types appropriately
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      // Try to convert to JSON string
      return JSON.stringify(value);
    } catch (e) {
      console.error('Error converting object to string:', e);
      return '';
    }
  }
  
  // Fallback for any other types
  return String(value);
}

// Helper function that validates and formats workflow ID for database queries
function getWorkflowIdForQuery(workflowId: WorkflowId): string {
  if (!isValidWorkflowIdString(workflowId)) {
    return '';  // Return empty string for invalid IDs (will be filtered by isValidWorkflowId check)
  }
  return safeToString(workflowId);
}

// Helper function to check if a value is a valid workflowId
function isValidWorkflowId(value: WorkflowId): boolean {
  return value !== null && 
         value !== undefined && 
         value !== 'new' &&
         value !== '';
}

// Helper function to safely stringify objects for database operations
function safeJsonStringify(value: any): string {
  try {
    // Explicitly cast the result as string to satisfy TypeScript
    const result = JSON.stringify(value);
    // Check if result is null or undefined - should never happen with JSON.stringify but TypeScript needs this
    return result || '{}';
  } catch (e) {
    console.error('Error stringifying value:', e);
    return '{}';
  }
}

export function useWorkflowStateManager(workflowId: WorkflowId) {
  const [pendingUpdates, setPendingUpdates] = useState<UpdateOperation[]>([]);
  const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);
  const lastProcessedTimestamp = useRef<number>(0);
  const updateTimeoutRef = useRef<number | null>(null);

  // Add an update operation to the queue
  const queueStateUpdate = useCallback((type: UpdateType, data: any, priority: number = 1) => {
    if (!workflowId || workflowId === 'new') return;
    
    setPendingUpdates(prev => [
      ...prev,
      {
        type,
        data,
        priority,
        timestamp: Date.now()
      }
    ]);
    
    // Clear any existing timeout and set a new one
    if (updateTimeoutRef.current) {
      window.clearTimeout(updateTimeoutRef.current);
    }
    
    // Schedule processing updates after a short delay to batch operations
    updateTimeoutRef.current = window.setTimeout(() => {
      processUpdates();
    }, 500); // Wait 500ms to batch operations
    
  }, [workflowId]);

  // Process the pending updates
  const processUpdates = useCallback(async () => {
    if (!isValidWorkflowId(workflowId) || isProcessingUpdate || pendingUpdates.length === 0) {
      return;
    }
    
    setIsProcessingUpdate(true);
    
    try {
      // Sort updates by priority and timestamp
      const sortedUpdates = [...pendingUpdates].sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.timestamp - b.timestamp; // Older updates first
      });
      
      // Get updates that haven't been processed yet
      const updatesToProcess = sortedUpdates.filter(
        update => update.timestamp > lastProcessedTimestamp.current
      );
      
      if (updatesToProcess.length === 0) {
        setIsProcessingUpdate(false);
        return;
      }
      
      // Group updates by type to reduce database calls
      const groupedUpdates: Record<UpdateType, any[]> = {
        node_config: [],
        node_position: [],
        node_data: [],
        edge_data: [],
        file_schema: [],
        node_metadata: []
      };
      
      updatesToProcess.forEach(update => {
        groupedUpdates[update.type].push(update.data);
      });
      
      // Process each update type
      for (const [type, updates] of Object.entries(groupedUpdates)) {
        if (updates.length === 0) continue;
        
        switch (type) {
          case 'node_config':
            await updateNodeConfigs(updates as { nodeId: string, config: any }[]);
            break;
          case 'node_position':
            await updateNodePositions(updates as { nodeId: string, position: { x: number, y: number } }[]);
            break;
          case 'node_data':
            await updateNodeData(updates as { nodeId: string, data: any }[]);
            break;
          case 'edge_data':
            await updateEdgeData(updates as { edgeId: string, data: any }[]);
            break;
          case 'file_schema':
            await updateFileSchema(updates as { nodeId: string, schema: any }[]);
            break;
          case 'node_metadata':
            await updateNodeMetadata(updates as { nodeId: string, metadata: any }[]);
            break;
        }
      }
      
      // Update the last processed timestamp
      const latestTimestamp = Math.max(...updatesToProcess.map(u => u.timestamp));
      lastProcessedTimestamp.current = latestTimestamp;
      
      // Clear processed updates
      setPendingUpdates(prev => 
        prev.filter(update => update.timestamp > latestTimestamp)
      );
      
    } catch (error) {
      console.error('Error processing workflow updates:', error);
      toast.error('Failed to save some workflow changes');
    } finally {
      setIsProcessingUpdate(false);
    }
  }, [workflowId, isProcessingUpdate, pendingUpdates]);

  // Update node configurations
  const updateNodeConfigs = async (updates: { nodeId: string, config: any }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      const workflowData = await fetchWorkflowData(formattedWorkflowId);
      if (!workflowData) return;
      
      let definition = JSON.parse(workflowData.definition || '{"nodes": [], "edges": []}');
      let modified = false;
      
      // Update node configs in the definition
      for (const update of updates) {
        const nodeIndex = definition.nodes.findIndex((node: any) => node.id === update.nodeId);
        if (nodeIndex >= 0) {
          definition.nodes[nodeIndex].data = {
            ...definition.nodes[nodeIndex].data,
            config: {
              ...definition.nodes[nodeIndex].data.config,
              ...update.config
            }
          };
          modified = true;
        }
      }
      
      if (modified) {
        await supabase
          .from('workflows')
          .update({ 
            definition: safeJsonStringify(definition) as string, // Explicit cast
            updated_at: new Date().toISOString()
          })
          .eq('id', formattedWorkflowId);
      }
    } catch (error) {
      console.error('Error updating node configs:', error);
      throw error;
    }
  };

  // Update node positions
  const updateNodePositions = async (updates: { nodeId: string, position: { x: number, y: number } }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      const workflowData = await fetchWorkflowData(formattedWorkflowId);
      if (!workflowData) return;
      
      let definition = JSON.parse(workflowData.definition || '{"nodes": [], "edges": []}');
      let modified = false;
      
      // Update node positions in the definition
      for (const update of updates) {
        const nodeIndex = definition.nodes.findIndex((node: any) => node.id === update.nodeId);
        if (nodeIndex >= 0) {
          definition.nodes[nodeIndex].position = update.position;
          modified = true;
        }
      }
      
      if (modified) {
        await supabase
          .from('workflows')
          .update({ 
            definition: safeJsonStringify(definition) as string, // Explicit cast
            updated_at: new Date().toISOString()
          })
          .eq('id', formattedWorkflowId);
      }
    } catch (error) {
      console.error('Error updating node positions:', error);
      throw error;
    }
  };

  // Update node data
  const updateNodeData = async (updates: { nodeId: string, data: any }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      const workflowData = await fetchWorkflowData(formattedWorkflowId);
      if (!workflowData) return;
      
      let definition = JSON.parse(workflowData.definition || '{"nodes": [], "edges": []}');
      let modified = false;
      
      // Update node data in the definition
      for (const update of updates) {
        const nodeIndex = definition.nodes.findIndex((node: any) => node.id === update.nodeId);
        if (nodeIndex >= 0) {
          definition.nodes[nodeIndex].data = {
            ...definition.nodes[nodeIndex].data,
            ...update.data
          };
          modified = true;
        }
      }
      
      if (modified) {
        await supabase
          .from('workflows')
          .update({ 
            definition: safeJsonStringify(definition) as string, // Explicit cast
            updated_at: new Date().toISOString()
          })
          .eq('id', formattedWorkflowId);
      }
    } catch (error) {
      console.error('Error updating node data:', error);
      throw error;
    }
  };

  // Update edge data
  const updateEdgeData = async (updates: { edgeId: string, data: any }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      const workflowData = await fetchWorkflowData(formattedWorkflowId);
      if (!workflowData) return;
      
      let definition = JSON.parse(workflowData.definition || '{"nodes": [], "edges": []}');
      let modified = false;
      
      // Update edge data in the definition
      for (const update of updates) {
        const edgeIndex = definition.edges.findIndex((edge: any) => edge.id === update.edgeId);
        if (edgeIndex >= 0) {
          definition.edges[edgeIndex] = {
            ...definition.edges[edgeIndex],
            ...update.data
          };
          modified = true;
        }
      }
      
      if (modified) {
        await supabase
          .from('workflows')
          .update({ 
            definition: safeJsonStringify(definition) as string, // Explicit cast
            updated_at: new Date().toISOString()
          })
          .eq('id', formattedWorkflowId);
      }
    } catch (error) {
      console.error('Error updating edge data:', error);
      throw error;
    }
  };

  // Update file schema for nodes
  const updateFileSchema = async (updates: { nodeId: string, schema: any }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      for (const update of updates) {
        // First check if a schema already exists
        const { data: existingSchema } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', formattedWorkflowId)
          .eq('node_id', update.nodeId)
          .maybeSingle();
        
        if (existingSchema) {
          // Update existing schema
          await supabase
            .from('workflow_file_schemas')
            .update({
              columns: update.schema.columns,
              data_types: update.schema.dataTypes,
              updated_at: new Date().toISOString()
            })
            .eq('workflow_id', formattedWorkflowId)
            .eq('node_id', update.nodeId);
        } else {
          // Insert new schema - require a file_id field based on schema
          // Find a dummy file ID if needed or add a workaround
          const dummyFileId = '00000000-0000-0000-0000-000000000000'; // Placeholder
          
          await supabase
            .from('workflow_file_schemas')
            .insert({
              workflow_id: formattedWorkflowId,
              node_id: update.nodeId,
              file_id: dummyFileId, // Adding required file_id
              columns: update.schema.columns,
              data_types: update.schema.dataTypes,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }
    } catch (error) {
      console.error('Error updating file schema:', error);
      throw error;
    }
  };

  // Update node metadata in workflow_files table
  const updateNodeMetadata = async (updates: { nodeId: string, metadata: any }[]) => {
    if (!isValidWorkflowId(workflowId) || updates.length === 0) return;
    
    try {
      const formattedWorkflowId = getWorkflowIdForQuery(workflowId);
      if (!formattedWorkflowId) return;
      
      for (const update of updates) {
        // Check if a record already exists
        const { data: existingRecord } = await supabase
          .from('workflow_files')
          .select('*')
          .eq('workflow_id', formattedWorkflowId)
          .eq('node_id', update.nodeId)
          .maybeSingle();
        
        if (existingRecord) {
          // Update existing record
          await supabase
            .from('workflow_files')
            .update({
              metadata: update.metadata,
              updated_at: new Date().toISOString()
            })
            .eq('workflow_id', formattedWorkflowId)
            .eq('node_id', update.nodeId);
        } else {
          // Insert new record - require a file_id field based on schema
          const dummyFileId = '00000000-0000-0000-0000-000000000000'; // Placeholder
          
          await supabase
            .from('workflow_files')
            .insert({
              workflow_id: formattedWorkflowId,
              node_id: update.nodeId,
              file_id: dummyFileId, // Adding required file_id
              metadata: update.metadata,
              status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }
    } catch (error) {
      console.error('Error updating node metadata:', error);
      throw error;
    }
  };

  // Helper to fetch workflow data
  const fetchWorkflowData = async (workflowId: string) => {
    if (!workflowId) return null;
    
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('definition')
        .eq('id', workflowId)
        .single();
      
      if (error) {
        console.error('Error fetching workflow data:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error in fetchWorkflowData:', error);
      return null;
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (updateTimeoutRef.current) {
        window.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return {
    queueStateUpdate,
    isPendingUpdate: pendingUpdates.length > 0,
    isProcessingUpdate,
    pendingUpdateCount: pendingUpdates.length
  };
}
