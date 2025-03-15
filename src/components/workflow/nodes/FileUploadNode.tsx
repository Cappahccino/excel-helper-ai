
import { FileUploadNodeData } from '@/types/workflow';
import FileUploadNode from './file-upload/FileUploadNode';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

// Make the propagate function available globally for backwards compatibility
if (typeof window !== 'undefined') {
  window.propagateSchemaDirectly = propagateSchemaDirectly;
}

// Re-export the component
export default FileUploadNode;
