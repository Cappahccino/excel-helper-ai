
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { ExcelData } from './types.ts';

export async function validateExcelFile(supabase: any, fileId: string): Promise<boolean> {
  try {
    const { data: file, error } = await supabase
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

export async function processExcelFiles(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  try {
    console.log(`Processing Excel file: ${fileId}`);

    // Get file information
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError || !file) {
      console.error('Error fetching file:', fileError);
      return null;
    }

    // First try to get existing metadata
    const { data: metadata, error: metadataError } = await supabase
      .from('file_metadata')
      .select('column_definitions, data_summary')
      .eq('file_id', fileId)
      .maybeSingle();

    if (metadata?.column_definitions && metadata?.data_summary) {
      console.log('Using cached metadata');
      return [{
        sheet: 'Sheet1',
        headers: Object.keys(metadata.column_definitions),
        data: metadata.data_summary
      }];
    }

    // If no metadata exists, process the file
    console.log('No metadata found, processing file...');

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('excel-files')
      .download(file.file_path);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      return null;
    }

    // Convert array buffer to binary string
    const arrayBuffer = await fileData.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });

    const results: ExcelData[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) continue;

      // Get headers from the first row
      const headers = Object.keys(jsonData[0]);

      // Create column definitions
      const columnDefinitions = headers.reduce((acc, header) => {
        acc[header] = {
          type: 'string', // Default type, could be improved with type detection
          nullable: true
        };
        return acc;
      }, {} as Record<string, { type: string; nullable: boolean }>);

      // Store metadata
      const { error: insertError } = await supabase
        .from('file_metadata')
        .upsert({
          file_id: fileId,
          column_definitions: columnDefinitions,
          data_summary: jsonData.slice(0, 100), // Store first 100 rows as summary
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

    // Update file processing status
    await supabase
      .from('excel_files')
      .update({
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', fileId);

    return results;
  } catch (error) {
    console.error('Error in processExcelFiles:', error);
    
    // Update file status to failed
    await supabase
      .from('excel_files')
      .update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      .eq('id', fileId);

    return null;
  }
}
