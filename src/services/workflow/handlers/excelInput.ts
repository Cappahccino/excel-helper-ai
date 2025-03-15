
import { supabase } from '@/integrations/supabase/client';

export const executeExcelInput = async (nodeData: any, options: any) => {
  console.log('Executing Excel input:', nodeData, options);
  
  const { workflowId, executionId, nodeId } = options;
  
  if (!workflowId || !nodeId) {
    console.error('Missing workflow ID or node ID for Excel input execution');
    return {
      success: false,
      error: 'Missing workflow ID or node ID'
    };
  }
  
  try {
    // Get node configuration including selected sheet
    const { data: nodeFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    // Determine which sheet to use
    const selectedSheet = nodeData?.config?.selectedSheet || 
      nodeFile?.metadata?.selected_sheet || 'Sheet1';
    
    console.log(`Using selected sheet: ${selectedSheet}`);
    
    // Get the schema for this node from workflow_file_schemas for the specific sheet
    const { data: schema, error: schemaError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, sample_data, total_rows')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', selectedSheet)
      .maybeSingle();
    
    if (schemaError) {
      console.error('Error fetching schema for Excel input:', schemaError);
      return {
        success: false,
        error: `Failed to fetch schema: ${schemaError.message}`
      };
    }
    
    if (!schema) {
      console.error(`No schema found for Excel input with sheet ${selectedSheet}`);
      return {
        success: false,
        error: `No schema found for sheet "${selectedSheet}"`
      };
    }
    
    // Get file metadata
    const { data: fileInfo, error: fileError } = await supabase
      .from('excel_files')
      .select('*, file_metadata(*)')
      .eq('id', schema.file_id)
      .maybeSingle();
      
    if (fileError || !fileInfo) {
      console.error('Error fetching file info for Excel input:', fileError);
      return {
        success: false,
        error: 'Could not retrieve file information'
      };
    }
    
    // Log detailed execution information for debugging
    console.log(`Excel input node ${nodeId} execution:
      - Selected sheet: ${selectedSheet}
      - File ID: ${schema.file_id}
      - Columns: ${schema.columns.length}
      - Sample data rows: ${schema.sample_data?.length || 0}
    `);
    
    // Return sheet-specific data and schema 
    return {
      success: true,
      data: {
        schema: {
          columns: schema.columns,
          types: schema.data_types
        },
        sheet: selectedSheet,
        file_id: schema.file_id,
        filename: fileInfo.filename,
        sample_data: schema.sample_data || [],
        total_rows: schema.total_rows || 0,
        headers: schema.columns
      }
    };
  } catch (error) {
    console.error('Error executing Excel input node:', error);
    return {
      success: false,
      error: error.message || 'Unknown error executing Excel input node'
    };
  }
};
