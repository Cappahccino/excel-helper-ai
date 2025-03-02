// src/services/workflow/handlers/spreadsheetGenerator.ts

import { NodeDefinition } from '@/types/workflow';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from "@/integrations/supabase/client";

interface SpreadsheetGeneratorConfig {
  filename?: string;
  sheets: Array<{
    name: string;
    data?: string; // Path to data from input
    headers?: string[]; // Manual header definitions
    columns?: Array<{
      field: string;
      header: string;
      width?: number;
    }>;
    startRow?: number;
    startCol?: number;
    includeHeaders?: boolean;
  }>;
  format?: 'xlsx' | 'csv' | 'ods';
  styling?: {
    headerStyle?: {
      bold?: boolean;
      fill?: string;
      color?: string;
    };
    alternateRowColors?: boolean;
  };
}

export async function handleSpreadsheetGenerator(
  node: NodeDefinition,
  inputs: Record<string, any>,
  context: any
) {
  const config = node.data.config as SpreadsheetGeneratorConfig;
  
  await context.logMessage('Starting spreadsheet generation', 'info', node.id);
  
  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // Process each sheet
    for (const sheetConfig of config.sheets) {
      let sheetData: any[] = [];
      
      // Get data for this sheet
      if (sheetConfig.data && inputs[sheetConfig.data]) {
        // Use data from a specified input path
        sheetData = inputs[sheetConfig.data];
      } else if (inputs.data && Array.isArray(inputs.data)) {
        // Use the default data input
        sheetData = inputs.data;
      }
      
      if (!Array.isArray(sheetData)) {
        throw new Error(`Data for sheet "${sheetConfig.name}" is not an array`);
      }
      
      // Create worksheet
      let worksheet;
      
      if (sheetData.length > 0) {
        // Determine columns and headers
        let columns: Array<{field: string, header: string}> = [];
        
        if (sheetConfig.columns && sheetConfig.columns.length > 0) {
          // Use explicitly defined columns
          columns = sheetConfig.columns;
        } else if (sheetConfig.headers && sheetConfig.headers.length > 0) {
          // Convert headers to columns
          columns = sheetConfig.headers.map(header => ({
            field: header,
            header: header
          }));
        } else {
          // Generate columns from data keys
          const sampleRow = sheetData[0];
          columns = Object.keys(sampleRow).map(key => ({
            field: key,
            header: key
          }));
        }
        
        // Convert data to array format expected by XLSX
        const headerRow = columns.map(col => col.header);
        
        const dataRows = sheetData.map(row => 
          columns.map(col => row[col.field])
        );
        
        const aoa = sheetConfig.includeHeaders !== false 
          ? [headerRow, ...dataRows]
          : dataRows;
        
        worksheet = XLSX.utils.aoa_to_sheet(aoa, {
          origin: {
            r: sheetConfig.startRow || 0,
            c: sheetConfig.startCol || 0
          }
        });
        
        // Apply column widths if specified
        if (sheetConfig.columns) {
          worksheet['!cols'] = sheetConfig.columns
            .filter(col => col.width !== undefined)
            .map(col => ({ wch: col.width }));
        }
      } else {
        // Create an empty worksheet if no data
        worksheet = XLSX.utils.aoa_to_sheet([[]]);
      }
      
      // Apply styling if specified
      if (config.styling) {
        // This would be expanded in a real implementation
        // Excel styling is complex and requires more detailed code
      }
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetConfig.name);
    }
    
    // Generate the file
    const filename = config.filename || `generated-${uuidv4()}.xlsx`;
    const fileExtension = (config.format === 'csv' ? '.csv' : 
                          config.format === 'ods' ? '.ods' : '.xlsx');
    const fullFilename = filename.endsWith(fileExtension) ? filename : `${filename}${fileExtension}`;
    
    // Convert workbook to buffer
    const wbout = XLSX.write(workbook, { bookType: config.format || 'xlsx', type: 'buffer' });
    
    // Save to Supabase storage
    const filePath = `generated/${uuidv4()}-${fullFilename}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('excel_files')
      .upload(filePath, wbout, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
    if (uploadError) throw uploadError;
    
    // Create DB record for the file
    const { data: fileRecord, error: dbError } = await supabase
      .from('excel_files')
      .insert({
        filename: fullFilename,
        file_path: filePath,
        file_size: wbout.length,
        user_id: context.userId,
        processing_status: "completed",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        file_hash: uuidv4(), // Generate a unique hash for this file
        storage_verified: true,
      })
      .select()
      .single();
      
    if (dbError) throw dbError;
    
    await context.logMessage(`Spreadsheet "${fullFilename}" generated successfully`, 'info', node.id);
    
    return {
      fileId: fileRecord.id,
      filename: fullFilename,
      filePath,
      fileSize: wbout.length,
      sheetCount: config.sheets.length,
      rowCounts: config.sheets.map((_, index) => 
        workbook.Sheets[workbook.SheetNames[index]] ? 
          XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[index]]).length : 0
      ),
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    await context.logMessage(
      `Failed to generate spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error',
      node.id
    );
    throw error;
  }
}
