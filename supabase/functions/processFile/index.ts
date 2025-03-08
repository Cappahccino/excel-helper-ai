
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to determine column data types based on sample data
const detectDataTypes = (rows: any[]): Record<string, string> => {
  if (!rows || rows.length === 0) return {};
  
  const firstRow = rows[0];
  const dataTypes: Record<string, string> = {};
  
  for (const key in firstRow) {
    const value = firstRow[key];
    
    if (value === null || value === undefined) {
      dataTypes[key] = 'unknown';
      continue;
    }

    const type = typeof value;
    
    if (type === 'number') {
      // Distinguish between integer and float
      dataTypes[key] = Number.isInteger(value) ? 'integer' : 'number';
    } else if (type === 'boolean') {
      dataTypes[key] = 'boolean';
    } else if (type === 'object') {
      if (Array.isArray(value)) {
        dataTypes[key] = 'array';
      } else {
        dataTypes[key] = 'object';
      }
    } else if (type === 'string') {
      // Try to detect dates
      if (!isNaN(Date.parse(value)) && 
          (value.includes('-') || value.includes('/')) && 
          (value.length >= 8)) {
        dataTypes[key] = 'date';
      } else {
        dataTypes[key] = 'string';
      }
    } else {
      dataTypes[key] = type;
    }
  }
  
  return dataTypes;
};

/**
 * Helper function to normalize workflow IDs for database operations
 * If it has a temp- prefix, extract the UUID part
 */
const normalizeWorkflowId = (workflowId: string): string => {
  if (!workflowId) return workflowId;
  
  // Extract UUID if it has temp- prefix
  if (workflowId.startsWith('temp-')) {
    return workflowId.substring(5); // Remove 'temp-' prefix
  }
  
  return workflowId;
};

/**
 * Determines if a workflow ID should be treated as temporary
 */
const isTemporaryWorkflow = (workflowId: string): boolean => {
  return workflowId ? workflowId.startsWith('temp-') : false;
};

/**
 * Update workflow file status with progress information
 */
const updateWorkflowFileStatus = async (
  workflowId: string, 
  fileId: string, 
  nodeId: string, 
  status: string, 
  progress?: number,
  result?: any,
  error?: string
) => {
  try {
    console.log(`Updating workflow file status: ${status}, progress: ${progress}`);
    const updateData: any = {
      status,
      processing_status: status,
      updated_at: new Date().toISOString()
    };

    if (progress !== undefined) {
      updateData.metadata = {
        ...updateData.metadata,
        progress
      };
    }

    if (result) {
      updateData.processing_result = result;
    }

    if (error) {
      updateData.processing_error = error;
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('workflow_files')
      .update(updateData)
      .eq('workflow_id', workflowId)
      .eq('file_id', fileId)
      .eq('node_id', nodeId);

    if (updateError) {
      console.error('Error updating workflow file status:', updateError);
    }
  } catch (error) {
    console.error('Failed to update workflow file status:', error);
  }
};

// Handle requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { fileId, workflowId, nodeId } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: "fileId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing file ${fileId} for workflow ${workflowId || 'N/A'} and node ${nodeId || 'N/A'}`);
    
    // Check if this is a temporary workflow
    const isTemporary = isTemporaryWorkflow(workflowId);
    console.log(`Workflow temporary status: ${isTemporary}`);
    
    // Get normalized ID for database operations
    const normalizedId = normalizeWorkflowId(workflowId);
    console.log(`Normalized workflow ID: ${normalizedId}`);

    // Update file status to processing
    const { error: updateError } = await supabase
      .from('excel_files')
      .update({ processing_status: 'processing' })
      .eq('id', fileId);

    if (updateError) {
      console.error("Error updating file status:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update file status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If this is part of a workflow, mark the workflow file as processing
    if (workflowId && nodeId) {
      try {
        // Create or update workflow file entry
        const { error: workflowFileError } = await supabase
          .from('workflow_files')
          .upsert({
            workflow_id: normalizedId,
            file_id: fileId,
            node_id: nodeId,
            status: 'processing',
            processing_status: 'processing',
            is_temporary: isTemporary,
            updated_at: new Date().toISOString(),
            metadata: { progress: 10 }
          }, { onConflict: 'workflow_id,file_id,node_id' });
        
        if (workflowFileError) {
          console.error("Error updating workflow file status:", workflowFileError);
          console.error("Error details:", JSON.stringify(workflowFileError));
          
          // Continue execution but log the error - the file processing can still work
          console.warn("Continuing despite workflow file association error");
        }
      } catch (workflowError) {
        // Log error but continue with file processing
        console.error("Exception in workflow file association:", workflowError);
        console.warn("Continuing with file processing despite association error");
      }
    }

    // Process the file (in a real implementation, you'd read the file from storage)
    try {
      // Update progress to 20%
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(normalizedId, fileId, nodeId, 'processing', 20);
      }
      
      // Simulate file processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update progress to 30%
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(normalizedId, fileId, nodeId, 'processing', 30);
      }
      
      // Generate mock sample data for demonstration
      // In a real implementation, this data would be read from the actual file
      const sampleRows = [
        { Column_A: 120, Column_B: "Value 1", Column_C: "2023-05-15" },
        { Column_A: 85, Column_B: "Value 2", Column_C: "2023-05-16" },
        { Column_A: 200, Column_B: "Value 3", Column_C: "2023-05-17" }
      ];
      
      // Extract column names and detect data types
      const columns = Object.keys(sampleRows[0]);
      const dataTypes = detectDataTypes(sampleRows);
      
      // Update progress to 50%
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(normalizedId, fileId, nodeId, 'processing', 50);
      }
      
      // Store file metadata
      const { error: metadataError } = await supabase
        .from('file_metadata')
        .upsert({
          file_id: fileId,
          column_definitions: dataTypes,
          row_count: 100, // Mock row count
          data_summary: {
            sample_data: sampleRows.slice(0, 5)
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'file_id' });
      
      if (metadataError) {
        console.error("Error storing file metadata:", metadataError);
        throw new Error(`Metadata storage failed: ${metadataError.message}`);
      }
      
      // Update progress to 70%
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(normalizedId, fileId, nodeId, 'processing', 70);
      }
      
      // If this is part of a workflow, create a file schema entry
      if (workflowId && nodeId) {
        try {
          // Create file schema with normalized ID and temporary flag
          const { error: schemaError } = await supabase
            .from('workflow_file_schemas')
            .upsert({
              workflow_id: normalizedId,
              node_id: nodeId,
              file_id: fileId,
              columns: columns,
              data_types: dataTypes,
              sample_data: sampleRows.slice(0, 10),
              has_headers: true,
              is_temporary: isTemporary,
              total_rows: 100 // Mock row count
            }, { onConflict: 'workflow_id,file_id,node_id' });
          
          if (schemaError) {
            console.error("Error creating file schema:", schemaError);
            console.error("Error details:", JSON.stringify(schemaError));
            throw new Error(`Schema creation failed: ${schemaError.message}`);
          }
        } catch (schemaError) {
          console.error("Exception in file schema creation:", schemaError);
          // Continue execution despite the schema error
        }
      }
      
      // Update progress to 90%
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(normalizedId, fileId, nodeId, 'processing', 90);
      }
      
      // Update file status to completed
      const { error: completeError } = await supabase
        .from('excel_files')
        .update({ 
          processing_status: 'completed',
          processing_completed_at: new Date().toISOString()
        })
        .eq('id', fileId);
        
      if (completeError) {
        console.error("Error updating file completion status:", completeError);
        throw new Error(`File completion update failed: ${completeError.message}`);
      }
      
      // Update workflow file status
      if (workflowId && nodeId) {
        const processingResult = {
          columns: columns,
          row_count: 100,
          data_types: dataTypes
        };
        
        await updateWorkflowFileStatus(
          normalizedId, 
          fileId, 
          nodeId, 
          'completed', 
          100, 
          processingResult
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "File processed successfully",
          fileId,
          workflowId,
          nodeId,
          schema: {
            columns,
            dataTypes,
            rowCount: 100
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    } catch (error) {
      console.error("Error processing file:", error);
      
      // Update file status to failed
      await supabase
        .from('excel_files')
        .update({ 
          processing_status: 'failed',
          error_message: error.message || "Unknown error during processing"
        })
        .eq('id', fileId);
      
      // Update workflow file status if applicable
      if (workflowId && nodeId) {
        await updateWorkflowFileStatus(
          normalizedId,
          fileId,
          nodeId,
          'failed',
          0,
          null,
          error.message || "Unknown error during processing"
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "File processing failed", 
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  } catch (error) {
    console.error("Request error:", error);
    return new Response(
      JSON.stringify({ error: "Invalid request", details: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
