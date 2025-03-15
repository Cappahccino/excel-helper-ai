
import { FileUploadNodeData } from '@/types/workflow';
import FileUploadNode from './file-upload/FileUploadNode';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';
import { standardizeSchemaColumns } from '@/utils/schemaStandardization';

// Make the propagate function available globally for backwards compatibility
if (typeof window !== 'undefined') {
  // Ensure the function always returns a Promise<boolean>
  window.propagateSchemaDirectly = async (workflowId, sourceNodeId, targetNodeId, sheetName) => {
    try {
      console.log(`Global schema propagation called: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'not specified'}`);
      return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
    } catch (error) {
      console.error('Error in propagateSchemaDirectly:', error);
      return false;
    }
  };
  
  // Also provide a schema standardization utility globally
  window.standardizeSchemaColumns = (columns) => {
    try {
      return standardizeSchemaColumns(columns);
    } catch (error) {
      console.error('Error standardizing schema columns:', error);
      return [];
    }
  };
}

// Re-export the component
export default FileUploadNode;
