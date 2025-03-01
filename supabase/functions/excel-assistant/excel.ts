
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { ExcelData, ProcessingError, ProcessingResponse } from "./types.ts";
import { supabaseAdmin } from "./database.ts";

async function validateExcelFile(fileId: string): Promise<boolean> {
  try {
    const { data: file, error } = await supabaseAdmin
      .from('excel_files')
      .select('storage_verified, processing_status')
      .eq('id', fileId)
      .maybeSingle();

    if (error) {
      console.error('Error validating file:', error);
      return false;
    }

    return !!file && file.storage_verified;
  } catch (error) {
    console.error('Error in validateExcelFile:', error);
    return false;
  }
}

async function processSingleExcelFile(fileId: string): Promise<ExcelData[]> {
  console.log(`Processing Excel file: ${fileId}`);

  try {
    // Get file information
    const { data: file, error: fileError } = await supabaseAdmin
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError || !file) {
      throw { message: 'Error fetching file', stage: 'validation' };
    }

    // First try to get existing metadata
    const { data: metadata, error: metadataError } = await supabaseAdmin
      .from('file_metadata')
      .select('column_definitions, data_summary')
      .eq('file_id', fileId)
      .maybeSingle();

    if (metadata?.column_definitions && metadata?.data_summary) {
      console.log('Using cached metadata for file:', fileId);
      return [{
        sheet: 'Sheet1',
        headers: Object.keys(metadata.column_definitions),
        data: metadata.data_summary
      }];
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('excel-files')
      .download(file.file_path);

    if (downloadError) {
      throw { message: 'Error downloading file', stage: 'download' };
    }

    // Process file
    const arrayBuffer = await fileData.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });

    const results: ExcelData[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) continue;

      const headers = Object.keys(jsonData[0]);
      const columnDefinitions = headers.reduce((acc, header) => {
        acc[header] = {
          type: 'string',
          nullable: true
        };
        return acc;
      }, {} as Record<string, { type: string; nullable: boolean }>);

      // Store metadata
      const { error: insertError } = await supabaseAdmin
        .from('file_metadata')
        .upsert({
          file_id: fileId,
          column_definitions: columnDefinitions,
          data_summary: jsonData.slice(0, 100),
          row_count: jsonData.length
        });

      if (insertError) {
        console.error('Error storing metadata:', insertError);
      }

      results.push({
        sheet: sheetName,
        headers,
        data: jsonData
      });
    }

    // Update processing status
    await supabaseAdmin
      .from('excel_files')
      .update({
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', fileId);

    return results;
  } catch (error) {
    console.error('Error processing file:', fileId, error);
    
    // Update file status to failed
    await supabaseAdmin
      .from('excel_files')
      .update({
        processing_status: 'failed',
        error_message: error.message || 'Unknown error occurred'
      })
      .eq('id', fileId);

    throw error;
  }
}

export async function processExcelFiles(fileIds: string[], messageId?: string): Promise<ProcessingResponse> {
  console.log('Processing Excel files:', fileIds);
  
  const startTime = Date.now();
  const errors: ProcessingError[] = [];
  const results: ExcelData[] = [];
  let processedCount = 0;

  try {
    // Validate all files first
    for (const fileId of fileIds) {
      const isValid = await validateExcelFile(fileId);
      if (!isValid) {
        errors.push({
          fileId,
          error: 'File is not valid or accessible',
          stage: 'validation'
        });
      }
    }

    // If any files failed validation, throw error
    if (errors.length === fileIds.length) {
      throw new Error('All files failed validation');
    }

    // Process valid files in parallel
    const validFileIds = fileIds.filter(fileId => 
      !errors.find(error => error.fileId === fileId)
    );

    // Process files and update progress
    for (const fileId of validFileIds) {
      try {
        const fileResults = await processSingleExcelFile(fileId);
        results.push(...fileResults);
        processedCount++;

        // Update message status with progress if messageId is provided
        if (messageId) {
          await supabaseAdmin
            .from('chat_messages')
            .update({
              metadata: {
                processing_stage: {
                  stage: 'processing_files',
                  progress: {
                    total: fileIds.length,
                    processed: processedCount,
                    failed: errors.length
                  },
                  started_at: startTime,
                  last_updated: Date.now()
                }
              }
            })
            .eq('id', messageId);
        }
      } catch (error) {
        errors.push({
          fileId,
          error: error.message || 'Unknown error during processing',
          stage: error.stage || 'processing'
        });
      }
    }

    return {
      success: results.length > 0,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        processedFiles: processedCount,
        totalFiles: fileIds.length,
        processingTime: Date.now() - startTime
      }
    };
  } catch (error) {
    console.error('Error in processExcelFiles:', error);
    return {
      success: false,
      errors: [{
        fileId: 'batch',
        error: error.message || 'Failed to process files',
        stage: 'processing'
      }],
      metadata: {
        processedFiles: processedCount,
        totalFiles: fileIds.length,
        processingTime: Date.now() - startTime
      }
    };
  }
}
