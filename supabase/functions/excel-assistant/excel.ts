
import { createClient } from '@supabase/supabase-js';
import { ExcelData } from './types.ts';

export async function validateExcelFile(supabase: any, fileId: string): Promise<boolean> {
  try {
    const { data: file } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    return !!file && file.storage_verified;
  } catch (error) {
    console.error('Error validating Excel file:', error);
    return false;
  }
}

export async function processExcelFiles(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  try {
    // First check if we have metadata for this file
    const { data: metadata } = await supabase
      .from('file_metadata')
      .select('column_definitions, data_summary')
      .eq('file_id', fileId)
      .single();

    if (metadata?.column_definitions && metadata?.data_summary) {
      console.log('Using cached metadata for file:', fileId);
      return [{
        sheet: 'Sheet1',
        headers: Object.keys(metadata.column_definitions),
        data: metadata.data_summary
      }];
    }

    // If no metadata, check the file status
    const { data: file } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (!file || !file.storage_verified) {
      console.error('File not found or not verified:', fileId);
      return null;
    }

    // Return minimal data if file is still processing
    if (file.processing_status === 'processing') {
      return [{
        sheet: 'Sheet1',
        headers: ['Status'],
        data: [{ Status: 'File is still being processed' }]
      }];
    }

    // Return error if processing failed
    if (file.processing_status === 'failed') {
      return [{
        sheet: 'Sheet1',
        headers: ['Error'],
        data: [{ Error: file.error_message || 'File processing failed' }]
      }];
    }

    // Return empty data if file is pending
    if (file.processing_status === 'pending') {
      return [{
        sheet: 'Sheet1',
        headers: ['Status'],
        data: [{ Status: 'File is pending processing' }]
      }];
    }

    // Return completed data
    return [{
      sheet: 'Sheet1',
      headers: ['Status'],
      data: [{ Status: 'File processing completed' }]
    }];
  } catch (error) {
    console.error('Error processing Excel file:', error);
    return null;
  }
}
