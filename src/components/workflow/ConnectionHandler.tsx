
import { useEffect } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const reactFlowInstance = useReactFlow();
  const { propagateFileSchema } = useWorkflow();

  // Handle data propagation when connections change
  useEffect(() => {
    if (!workflowId) return;
    
    // Process all edges to propagate file schemas
    const handleEdges = async () => {
      // Get edges from the reactFlowInstance state using getEdges method
      const currentEdges = reactFlowInstance.getEdges();
      
      for (const edge of currentEdges) {
        // Propagate file schema from source to target
        await propagateFileSchema(edge.source, edge.target);
      }
    };
    
    handleEdges();
  }, [reactFlowInstance, workflowId, propagateFileSchema]);

  // No rendering needed, this is a utility component
  return null;
};

export default ConnectionHandler;
