import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/types/workflow';

export interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
}

export const schemaUtils = {
  async getNodeSchema(workflowId: string, nodeId: string): Promise<SchemaColumn[]> {
    try {
      console.log(`Getting schema for node ${nodeId} in workflow ${workflowId}`);
      
      // Format workflowId for database if needed
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
      
      // Check if this node has a direct schema (e.g., file upload node)
      const { data: directSchema, error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .select('data_types, columns')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (schemaError) {
        console.error('Error fetching direct schema:', schemaError);
      }
      
      if (directSchema && directSchema.data_types) {
        try {
          // Convert data_types to SchemaColumn[]
          const columnsData = directSchema.data_types;
          if (typeof columnsData === 'object' && columnsData !== null) {
            const schemaColumns: SchemaColumn[] = Object.entries(columnsData).map(([name, type]) => ({
              name,
              type: typeof type === 'string' ? type : 'string'
            }));
            console.log('Found direct schema for node:', schemaColumns);
            return schemaColumns;
          }
        } catch (e) {
          console.error('Error parsing schema data_types:', e);
        }
      }
      
      // If no direct schema, look for incoming connections
      const { data: edges, error: edgesError } = await supabase
        .from('workflow_edges')
        .select('source_node_id, metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('target_node_id', nodeId);
      
      if (edgesError) {
        console.error('Error fetching edges:', edgesError);
      }
      
      if (!edges || edges.length === 0) {
        console.log('No incoming edges found for node:', nodeId);
        return [];
      }
      
      console.log('Found incoming edges:', edges);
      
      // First try to get schema from edge metadata
      for (const edge of edges) {
        if (edge.metadata && 
            typeof edge.metadata === 'object' && 
            edge.metadata !== null &&
            'schema' in edge.metadata && 
            edge.metadata.schema && 
            typeof edge.metadata.schema === 'object' && 
            'columns' in edge.metadata.schema) {
          console.log('Found schema in edge metadata:', edge.metadata.schema.columns);
          return edge.metadata.schema.columns as SchemaColumn[];
        }
      }
      
      // If not found in metadata, get from source node
      const sourceNodeId = edges[0].source_node_id;
      console.log('Looking for schema from source node:', sourceNodeId);
      return await this.getNodeSchema(workflowId, sourceNodeId);
    } catch (error) {
      console.error('Error in getNodeSchema:', error);
      return [];
    }
  },
  
  async propagateSchema(workflowId: string, sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
      
      // Format workflowId for database
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
      
      // Get source node schema
      const sourceSchema = await this.getNodeSchema(workflowId, sourceNodeId);
      console.log('Source schema to propagate:', sourceSchema);
      
      if (!sourceSchema || sourceSchema.length === 0) {
        console.warn('No schema found to propagate');
        return false;
      }
      
      // Get the existing edge
      const { data: existingEdge, error: edgeError } = await supabase
        .from('workflow_edges')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', sourceNodeId)
        .eq('target_node_id', targetNodeId)
        .maybeSingle();
        
      if (edgeError) {
        console.error('Error fetching edge:', edgeError);
        return false;
      }
      
      // Merge with existing metadata or create new
      let metadata = {};
      if (existingEdge && existingEdge.metadata && typeof existingEdge.metadata === 'object') {
        metadata = existingEdge.metadata;
      }
      
      const updatedMetadata = {
        ...metadata,
        schema: { columns: sourceSchema }
      };
      
      console.log('Updating edge with metadata:', updatedMetadata);
      
      // Store schema in edge metadata
      const { error } = await supabase
        .from('workflow_edges')
        .update({ metadata: updatedMetadata })
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', sourceNodeId)
        .eq('target_node_id', targetNodeId);
      
      if (error) {
        console.error('Error updating edge metadata:', error);
        return false;
      }
      
      console.log('Schema propagation successful');
      return true;
    } catch (error) {
      console.error('Error in propagateSchema:', error);
      return false;
    }
  }
};
