
import * as XLSX from 'npm:xlsx';
import { ExcelData } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export async function processExcelFile(supabase: ReturnType<typeof createClient>, fileId: string): Promise<ExcelData[] | null> {
  if (!fileId) return null;
  
  console.log(`📂 Processing file ID: ${fileId}`);
  
  const { data: fileData, error: fileError } = await supabase
    .from('excel_files')
    .select('file_path')
    .eq('id', fileId)
    .single();

  if (fileError) throw new Error(`File metadata error: ${fileError.message}`);
  
  const { data: fileBuffer, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileData.file_path);

  if (downloadError) throw new Error(`File download error: ${downloadError.message}`);

  try {
    const arrayBuffer = await fileBuffer.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    const results: ExcelData[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      const limitedData = jsonData.slice(0, 1000);
      results.push({
        sheetName,
        data: limitedData
      });
    }
    
    return results;
  } catch (error) {
    console.error('Excel processing error:', error);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}
