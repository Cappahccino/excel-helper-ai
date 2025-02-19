
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
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

    return !!file && 
           file.storage_verified && 
           ['completed', 'processing', 'analyzing'].includes(file.processing_status);
  } catch (error) {
    console.error('Error in validateExcelFile:', error);
    return false;
  }
}

export async function processExcelFiles(supabase: any, fileId: string): Promise<ExcelData[] | null> {
  try {
    console.log(`Processing Excel file: ${fileId}`);

    // First check if we have metadata
    const { data: metadata, error: metadataError } = await supabase
      .from('file_metadata')
      .select('column_definitions, data_summary')
      .eq('file_id', fileId)
      .maybeSingle();

    if (metadataError) {
      console.error('Error fetching metadata:', metadataError);
    } else if (metadata?.column_definitions && metadata?.data_summary) {
      console.log('Using cached metadata');
      return [{
        sheet: 'Sheet1',
        headers: Object.keys(metadata.column_definitions),
        data: metadata.data_summary
      }];
    }

    // If no metadata, check file status
    const { data: file, error: fileError } = await supabase
      .from('excel_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fileError) {
      console.error('Error fetching file:', fileError);
      return null;
    }

    if (!file || !file.storage_verified) {
      console.warn('File not found or not verified');
      return null;
    }

    // Return appropriate response based on processing status
    switch (file.processing_status) {
      case 'completed':
        return [{
          sheet: 'Sheet1',
          headers: ['Status'],
          data: [{ Status: 'File processing completed' }]
        }];

      case 'processing':
        return [{
          sheet: 'Sheet1',
          headers: ['Status'],
          data: [{ Status: 'File is currently being processed' }]
        }];

      case 'failed':
        return [{
          sheet: 'Sheet1',
          headers: ['Error'],
          data: [{ Error: file.error_message || 'File processing failed' }]
        }];

      case 'pending':
        return [{
          sheet: 'Sheet1',
          headers: ['Status'],
          data: [{ Status: 'File is queued for processing' }]
        }];

      default:
        return [{
          sheet: 'Sheet1',
          headers: ['Status'],
          data: [{ Status: `Unknown file status: ${file.processing_status}` }]
        }];
    }
  } catch (error) {
    console.error('Error in processExcelFiles:', error);
    return null;
  }
}
