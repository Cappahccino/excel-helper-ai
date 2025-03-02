
import { NodeInputs, NodeOutputs } from '@/types/workflow';
import * as XLSX from 'xlsx';

// Generate an Excel file from input data
export const generateSpreadsheet = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    const data = inputs.data || [];
    const filename = config.filename || 'generated.xlsx';
    const sheets = config.sheets || [{ name: 'Sheet1', data: null }];
    
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // For each sheet in the configuration
    for (const sheet of sheets) {
      const sheetName = sheet.name || 'Sheet';
      const sheetData = sheet.data || data;
      
      if (!Array.isArray(sheetData) || sheetData.length === 0) {
        // Create an empty worksheet if no data
        const ws = XLSX.utils.aoa_to_sheet([['No data']]);
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
        continue;
      }
      
      // Convert the data to a worksheet
      const ws = XLSX.utils.json_to_sheet(sheetData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
    
    // Write the workbook to a binary string
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    // In a real implementation, you would save this buffer to a file or return it
    // For now, we'll just return some metadata
    return {
      filename,
      sheetCount: sheets.length,
      size: excelBuffer.length,
      generatedAt: new Date().toISOString(),
      // buffer: excelBuffer  // We could include the buffer if needed
    };
  } catch (error) {
    console.error('Error generating spreadsheet:', error);
    throw new Error(`Spreadsheet generation error: ${error}`);
  }
};
