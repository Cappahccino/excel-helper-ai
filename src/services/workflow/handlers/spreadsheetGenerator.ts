
// src/services/workflow/handlers/spreadsheetGenerator.ts

import { NodeData, NodeInputs, NodeOutputs, NodeHandler } from '@/types/workflow';
import * as XLSX from 'xlsx';

export const spreadsheetGenerator: NodeHandler = {
  type: 'spreadsheetGenerator',
  
  async execute(nodeData: NodeData, inputs: NodeInputs): Promise<NodeOutputs> {
    console.log('Executing Spreadsheet Generator node', nodeData);
    
    const inputData = inputs.input;
    if (!inputData || !Array.isArray(inputData)) {
      throw new Error('Spreadsheet Generator node requires array input data');
    }
    
    const config = nodeData.config || {};
    const filename = config.filename || 'generated-spreadsheet.xlsx';
    const format = (config.format || 'xlsx').toLowerCase();
    const sheets = config.sheets || [{ name: 'Sheet1', includeHeaders: true }];
    
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Process each sheet
      for (const sheetConfig of sheets) {
        const sheetName = sheetConfig.name || 'Sheet1';
        const includeHeaders = sheetConfig.includeHeaders !== false;
        
        // Get the data for this sheet (filter if needed)
        let sheetData = inputData;
        if (sheetConfig.filter && typeof sheetConfig.filter === 'object') {
          // Apply filters if specified
          const filters = sheetConfig.filter;
          sheetData = inputData.filter(item => {
            for (const [key, value] of Object.entries(filters)) {
              if (item[key] !== value) return false;
            }
            return true;
          });
        }
        
        if (sheetData.length === 0) {
          console.warn(`No data for sheet "${sheetName}" after filtering`);
          continue;
        }
        
        // Convert to worksheet
        let worksheet;
        
        if (includeHeaders && sheetData.length > 0) {
          // Use headers from data
          worksheet = XLSX.utils.json_to_sheet(sheetData);
        } else {
          // Convert array of arrays or manually convert objects to arrays
          const data = sheetData.map(row => Object.values(row));
          worksheet = XLSX.utils.aoa_to_sheet(data);
        }
        
        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
      
      // Generate the binary data
      const excelData = XLSX.write(workbook, { bookType: format, type: 'array' });
      
      // Convert to base64 for output
      const base64Data = Buffer.from(excelData).toString('base64');
      
      return {
        output: {
          filename,
          format,
          data: base64Data,
          mimeType: format === 'xlsx' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/vnd.ms-excel',
          size: excelData.byteLength
        }
      };
    } catch (error) {
      console.error('Error in Spreadsheet Generator node:', error);
      throw error;
    }
  }
};

export default spreadsheetGenerator;
