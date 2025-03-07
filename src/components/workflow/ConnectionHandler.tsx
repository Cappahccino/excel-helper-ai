
import { useEffect } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const { edges, getNodes } = useReactFlow();
  const { propagateFileSchema } = useWorkflow();

  // Handle data propagation when connections change
  useEffect(() => {
    if (!workflowId) return;
    
    // Process all edges to propagate file schemas
    const handleEdges = async () => {
      for (const edge of edges) {
        // Propagate file schema from source to target
        await propagateFileSchema(edge.source, edge.target);
      }
    };
    
    handleEdges();
  }, [edges, workflowId, propagateFileSchema]);

  // No rendering needed, this is a utility component
  return null;
};

export default ConnectionHandler;
