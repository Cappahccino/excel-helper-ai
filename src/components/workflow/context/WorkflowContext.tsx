
import React, { createContext, useContext, useState, useEffect } from 'react';
import { WorkflowNode, FileSchema } from '@/types/workflow';
import { ReactFlowInstance, Edge } from '@xyflow/react';

interface WorkflowContextType {
  // Flow state
  nodes: WorkflowNode[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  reactFlowInstance: ReactFlowInstance | null;
  setReactFlowInstance: React.Dispatch<React.SetStateAction<ReactFlowInstance | null>>;
  
  // File schemas for data sharing between nodes
  fileSchemas: FileSchema[];
  setFileSchemas: React.Dispatch<React.SetStateAction<FileSchema[]>>;
  
  // Workflow metadata
  workflowId: string | undefined;
  workflowName: string;
  setWorkflowName: React.Dispatch<React.SetStateAction<string>>;
  isModified: boolean;
  setIsModified: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Utility functions
  getNodeById: (id: string) => WorkflowNode | undefined;
  getConnectedNodes: (nodeId: string) => { sources: WorkflowNode[]; targets: WorkflowNode[] };
  updateNodeData: (nodeId: string, data: Partial<any>) => void;
  getFileSchemaForNode: (nodeId: string) => FileSchema | undefined;
  getFileSchemaByFileId: (fileId: string) => FileSchema | undefined;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
};

export const WorkflowProvider: React.FC<{
  children: React.ReactNode;
  workflowId?: string;
}> = ({ children, workflowId }) => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [fileSchemas, setFileSchemas] = useState<FileSchema[]>([]);
  const [workflowName, setWorkflowName] = useState<string>('Untitled Workflow');
  const [isModified, setIsModified] = useState<boolean>(false);
  
  // Utility function to get a node by its ID
  const getNodeById = (id: string): WorkflowNode | undefined => {
    return nodes.find(node => node.id === id);
  };
  
  // Get nodes connected to the specified node
  const getConnectedNodes = (nodeId: string) => {
    const sources: WorkflowNode[] = [];
    const targets: WorkflowNode[] = [];
    
    edges.forEach(edge => {
      if (edge.target === nodeId) {
        const sourceNode = getNodeById(edge.source);
        if (sourceNode) sources.push(sourceNode);
      }
      
      if (edge.source === nodeId) {
        const targetNode = getNodeById(edge.target);
        if (targetNode) targets.push(targetNode);
      }
    });
    
    return { sources, targets };
  };
  
  // Update a node's data
  const updateNodeData = (nodeId: string, data: Partial<any>) => {
    setNodes(prevNodes => 
      prevNodes.map(node => 
        node.id === nodeId 
          ? { ...node, data: { ...node.data, ...data } } 
          : node
      )
    );
    setIsModified(true);
  };
  
  // Get file schema for a specific node
  const getFileSchemaForNode = (nodeId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.nodeId === nodeId);
  };
  
  // Get file schema by file ID
  const getFileSchemaByFileId = (fileId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.fileId === fileId);
  };
  
  const contextValue: WorkflowContextType = {
    nodes,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    setReactFlowInstance,
    fileSchemas,
    setFileSchemas,
    workflowId,
    workflowName,
    setWorkflowName,
    isModified,
    setIsModified,
    getNodeById,
    getConnectedNodes,
    updateNodeData,
    getFileSchemaForNode,
    getFileSchemaByFileId
  };
  
  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
};
