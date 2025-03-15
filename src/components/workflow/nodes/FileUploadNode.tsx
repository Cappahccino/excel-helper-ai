
import { FileUploadNodeData } from '@/types/workflow';
import FileUploadNode from './file-upload/FileUploadNode';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

// Make the propagate function available globally for backwards compatibility
if (typeof window !== 'undefined') {
  // Ensure the function always returns a Promise<boolean>
  window.propagateSchemaDirectly = async (workflowId, sourceNodeId, targetNodeId, sheetName) => {
    try {
      return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
    } catch (error) {
      console.error('Error in propagateSchemaDirectly:', error);
      return false;
    }
  };
}

// Re-export the component
export default FileUploadNode;
