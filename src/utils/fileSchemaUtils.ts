
import { supabase } from '@/integrations/supabase/client';
import { FileSchema } from '@/components/workflow/context/WorkflowContext';

export interface WorkflowFileSchema {
  file_id: string;
  node_id: string;
  workflow_id: string;
  columns: string[];
  headers: string[];
  preview_data?: any[];
  selected_sheet?: string;
  row_count?: number;
  created_at?: string;
  updated_at?: string;
}

export async function saveFileSchema(
  fileId: string,
  workflowId: string,
  nodeId: string,
  sampleData: any[],
  hasHeaders: boolean = true,
  selectedSheet?: string
): Promise<FileSchema | null> {
  try {
    if (!sampleData || sampleData.length === 0) {
      console.error('No sample data provided for schema extraction');
      return null;
    }

    // Extract headers from first row if it has headers
    const firstRow = sampleData[0];
    
    // Get all unique keys across all rows to ensure we capture all possible columns
    const allKeys = new Set<string>();
    sampleData.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });
    
    const headers = Array.from(allKeys);

    // Create schema object
    const schema: WorkflowFileSchema = {
      file_id: fileId,
      node_id: nodeId,
      workflow_id: workflowId,
      columns: headers,
      headers: headers,
      preview_data: sampleData.slice(0, 10), // Store a limited sample
      selected_sheet: selectedSheet,
      row_count: sampleData.length
    };

    // Save to database
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .upsert(schema, { 
        onConflict: 'file_id,node_id,workflow_id'
      });

    if (error) {
      console.error('Error saving file schema:', error);
      return null;
    }

    // Return as client-side schema
    return {
      fileId,
      nodeId,
      workflowId,
      columns: headers,
      headers: headers,
      previewData: sampleData.slice(0, 10),
      selectedSheet,
      rowCount: sampleData.length
    };
  } catch (err) {
    console.error('Error in saveFileSchema:', err);
    return null;
  }
}

export async function getFileSchema(
  fileId: string,
  workflowId: string,
  nodeId: string
): Promise<FileSchema | null> {
  try {
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .single();

    if (error) {
      console.error('Error fetching file schema:', error);
      return null;
    }

    if (!data) return null;

    return {
      fileId: data.file_id,
      nodeId: data.node_id,
      workflowId: data.workflow_id,
      columns: data.columns || [],
      headers: data.headers || data.columns || [],
      previewData: data.preview_data || data.sample_data,
      selectedSheet: data.selected_sheet || data.sheet_name,
      rowCount: data.row_count || data.total_rows
    };
  } catch (err) {
    console.error('Error in getFileSchema:', err);
    return null;
  }
}
