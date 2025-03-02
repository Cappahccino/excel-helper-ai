import { NodeInputs, NodeOutputs } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

// Handler for Excel input nodes
export const handleExcelInput = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    const fileId = config.fileId;
    
    if (!fileId) {
      throw new Error('No file selected for Excel input node');
    }
    
    // Fetch the Excel file from Supabase storage
    const { data: fileData, error: fileError } = await supabase
      .storage
      .from('excel_files')
      .download(`${fileId}.xlsx`);
    
    if (fileError) {
      throw new Error(`Error downloading file: ${fileError.message}`);
    }
    
    if (!fileData) {
      throw new Error('No file data received from storage');
    }
    
    // Convert the Excel file to a buffer
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const buffer = Buffer.from(arrayBuffer);
        resolve(buffer);
      };
      fileReader.onerror = (error) => {
        reject(error);
      };
      fileReader.readAsArrayBuffer(fileData);
    });
    
    // Read the Excel file using xlsx library
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Assuming the first sheet is the data source
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert the worksheet to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Use the first row as headers if hasHeaders is true
    let headers: string[] = [];
    let data: any[] = [];
    
    if (config.hasHeaders && Array.isArray(jsonData) && jsonData.length > 0) {
      headers = jsonData[0] as string[];
      data = jsonData.slice(1).map((row: any) => {
        const rowData: Record<string, any> = {};
        if (Array.isArray(row)) {
          headers.forEach((header, index) => {
            rowData[header] = row[index];
          });
        }
        return rowData;
      });
    } else {
      headers = Array.from({ length: (jsonData[0] as any[]).length }, (_, i) => `column${i + 1}`);
      data = jsonData.map((row: any) => {
        const rowData: Record<string, any> = {};
        if (Array.isArray(row)) {
          headers.forEach((header, index) => {
            rowData[header] = row[index];
          });
        }
        return rowData;
      });
    }
    
    return { data: data, headers: headers };
  } catch (error) {
    console.error('Error in Excel input node:', error);
    throw new Error(`Excel input error: ${error}`);
  }
};

// Function to apply a formula to a data set
export const applyFormula = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  const inputData = inputs.data || [];
  
  if (!Array.isArray(inputData) || inputData.length === 0) {
    return { data: [] };
  }
  
  try {
    // Get the formula from the config
    const formula = config.formula as string;
    
    if (!formula) {
      return { data: inputData }; // Return original data if no formula
    }
    
    // Apply the formula to each item in the data
    const transformedData = inputData.map((item: any) => {
      try {
        // Use eval() to execute the formula with the item as context
        const result = eval(formula);
        return result;
      } catch (e: any) {
        console.error(`Error applying formula to item: ${e}`);
        return null; // Or some other error indicator
      }
    });
    
    return { data: inputData };
  } catch (error) {
    console.error('Error applying formula:', error);
    throw new Error(`Formula execution error: ${error}`);
  }
};
