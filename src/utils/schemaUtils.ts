
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';

export interface SchemaColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown';
}

export interface Schema {
  columns: SchemaColumn[];
}

export const schemaUtils = {
  /**
   * Retrieve schema for a specific node by traversing the graph
   */
  async getNodeSchema(workflowId: string | null, nodeId: string): Promise<SchemaColumn[]> {
    if (!workflowId || !nodeId) return [];
    
    try {
      // Convert to database workflow ID format
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      console.log(`Getting schema for node ${nodeId} in workflow ${dbWorkflowId}`);
      
      // First check if this node has a direct schema (e.g., file upload node)
      const { data: directSchema, error: schemaError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      if (directSchema) {
        console.log(`Found direct schema for node ${nodeId}:`, directSchema);
        
        // Convert from database format to SchemaColumn[]
        return directSchema.columns.map((colName: string) => ({
          name: colName,
          type: this.mapDatabaseTypeToSchemaType(directSchema.data_types[colName])
        }));
      }
      
      // If no direct schema, look for incoming connections
      const { data: edges, error: edgesError } = await supabase
        .from('workflow_edges')
        .select('source_node_id, metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('target_node_id', nodeId);
      
      if (edgesError) {
        console.error('Error fetching edges:', edgesError);
        return [];
      }
      
      if (!edges || edges.length === 0) {
        console.log(`No incoming edges found for node ${nodeId}`);
        return [];
      }
      
      // First try to get schema from edge metadata
      const edgeWithSchema = edges.find(edge => 
        edge.metadata && edge.metadata.schema && Array.isArray(edge.metadata.schema.columns)
      );
      
      if (edgeWithSchema) {
        console.log(`Found schema in edge metadata:`, edgeWithSchema.metadata.schema);
        return edgeWithSchema.metadata.schema.columns;
      }
      
      // If not found in metadata, recursively get from source node
      const sourceNodeId = edges[0].source_node_id;
      console.log(`Recursively getting schema from source node ${sourceNodeId}`);
      return await this.getNodeSchema(workflowId, sourceNodeId);
    } catch (error) {
      console.error('Error in getNodeSchema:', error);
      return [];
    }
  },
  
  /**
   * Propagate schema from source node to target node via edge metadata
   */
  async propagateSchema(workflowId: string | null, sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    if (!workflowId || !sourceNodeId || !targetNodeId) {
      console.error('Missing required parameters for propagateSchema');
      return false;
    }
    
    try {
      console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId} in workflow ${workflowId}`);
      
      // Convert to database workflow ID format
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // Get source node schema
      const sourceSchema = await this.getNodeSchema(workflowId, sourceNodeId);
      
      if (!sourceSchema || sourceSchema.length === 0) {
        console.log(`No schema available from source node ${sourceNodeId}`);
        return false;
      }
      
      // Get the existing edge
      const { data: existingEdge, error: edgeError } = await supabase
        .from('workflow_edges')
        .select('id, metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', sourceNodeId)
        .eq('target_node_id', targetNodeId)
        .maybeSingle();
        
      if (edgeError) {
        console.error('Error fetching edge:', edgeError);
        return false;
      }
      
      if (!existingEdge) {
        console.error(`Edge not found between ${sourceNodeId} and ${targetNodeId}`);
        return false;
      }
      
      // Merge with existing metadata or create new
      const updatedMetadata = {
        ...(existingEdge.metadata || {}),
        schema: { columns: sourceSchema }
      };
      
      // Store schema in edge metadata
      const { error } = await supabase
        .from('workflow_edges')
        .update({ metadata: updatedMetadata })
        .eq('id', existingEdge.id);
      
      if (error) {
        console.error('Error propagating schema:', error);
        return false;
      }
      
      console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}`);
      return true;
    } catch (error) {
      console.error('Error in propagateSchema:', error);
      return false;
    }
  },
  
  /**
   * Map database type to schema type
   */
  mapDatabaseTypeToSchemaType(dbType: string): SchemaColumn['type'] {
    if (!dbType) return 'string';
    
    const typeLower = dbType.toLowerCase();
    
    if (typeLower.includes('int') || typeLower.includes('float') || typeLower === 'number' || typeLower === 'decimal') {
      return 'number';
    }
    
    if (typeLower.includes('date') || typeLower.includes('time')) {
      return 'date';
    }
    
    if (typeLower === 'boolean' || typeLower === 'bool') {
      return 'boolean';
    }
    
    if (typeLower.includes('json') || typeLower.includes('object')) {
      return 'object';
    }
    
    if (typeLower.includes('array')) {
      return 'array';
    }
    
    return 'string';
  }
};
