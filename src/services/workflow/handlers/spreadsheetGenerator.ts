
import { NodeHandler, NodeInputs, NodeOutputs } from '@/types/workflow';

export const handleSpreadsheetGeneration = async (inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> => {
  try {
    const inputData = inputs.data || [];
    const filename = config.filename || 'generated.xlsx';
    const sheets = config.sheets || [];
    
    console.log(`[Spreadsheet Generator] Generating spreadsheet: ${filename}`);
    console.log(`[Spreadsheet Generator] Number of sheets: ${sheets.length}`);
    
    // For testing purposes, simulate successful generation with delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return mock result
    return {
      success: true,
      filename,
      sheetCount: sheets.length,
      fileSize: Math.floor(Math.random() * 1024 * 100) + 1024 // Random file size between 1KB and 100KB
    };
  } catch (error) {
    console.error('[Spreadsheet Generator] Error:', error);
    throw error;
  }
};

// Export the node handler
export const spreadsheetGeneratorHandler: NodeHandler = {
  execute: handleSpreadsheetGeneration
};
