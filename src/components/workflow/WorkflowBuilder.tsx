import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  useReactFlow,
  Node,
  Edge,
  updateEdge,
} from '@xyflow/react';
import { MiniMap } from '@xyflow/react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { useToast } from "@/components/ui/use-toast"
import { Plus, Save, Copy, Trash2, X, Download, Upload } from 'lucide-react';
import { nodeTypes } from '@/components/canvas/NodeTypes';
import { edgeTypes } from '@/components/canvas/EdgeTypes';
import { initialNodes } from '@/components/canvas/InitialNodes';
import { initialEdges } from '@/components/canvas/InitialEdges';
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel';
import { NodeLibrary } from '@/components/workflow/NodeLibrary';
import { WorkflowDefinition, WorkflowNode } from '@/types/workflow';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { workflowService } from '@/services/workflowService';
import { useWorkflow } from './context/WorkflowContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

import '@xyflow/react/dist/style.css';
import '@/app/globals.css';

const WorkflowBuilder: React.FC = () => {
  const { toast } = useToast();
  const { user } = useUser();
  const router = useRouter();
  const { workflowId, isTemporaryId, convertToDbWorkflowId, formatWorkflowId } = useWorkflow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isNodeLibraryOpen, setIsNodeLibraryOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const { screenToWorld } = useReactFlow();
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isWorkflowNameDialogOpen, setIsWorkflowNameDialogOpen] = useState(false);

  const edgeUpdateSuccessful = useRef(true);
  
  const { data: workflowData, isLoading: isWorkflowLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowService.getWorkflow(workflowId as string),
    enabled: !!workflowId && !isTemporaryId(workflowId as string),
    onSuccess: (data) => {
      if (data) {
        setNodes(data.nodes as WorkflowNode[]);
        setEdges(data.edges as Edge[]);
        setWorkflowName(data.name);
      }
    },
    onError: (error) => {
      console.error('Error fetching workflow:', error);
      toast({
        title: "Error",
        description: "Failed to load workflow details.",
        variant: "destructive",
      })
    }
  });

  const { mutate: saveWorkflow, isLoading: isSaveLoading } = useMutation({
    mutationFn: (workflowDefinition: WorkflowDefinition) => {
      if (!workflowId) {
        throw new Error('Workflow ID is missing.');
      }
      return workflowService.updateWorkflow(workflowId, workflowDefinition);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Workflow saved successfully.",
      })
    },
    onError: (error) => {
      console.error('Error saving workflow:', error);
      toast({
        title: "Error",
        description: "Failed to save workflow.",
        variant: "destructive",
      })
    },
  });

  const { mutate: createWorkflowCopy, isLoading: isCopyLoading } = useMutation({
    mutationFn: (workflowId: string) => workflowService.duplicateWorkflow(workflowId),
    onSuccess: (newWorkflow) => {
      if (newWorkflow && newWorkflow.id) {
        router.push(`/workflow/${newWorkflow.id}`);
        toast({
          title: "Success",
          description: "Workflow duplicated successfully.",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to duplicate workflow.",
          variant: "destructive",
        })
      }
    },
    onError: (error) => {
      console.error('Error duplicating workflow:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate workflow.",
        variant: "destructive",
      })
    },
  });

  const { mutate: deleteWorkflow, isLoading: isDeleteLoading } = useMutation({
    mutationFn: (workflowId: string) => workflowService.deleteWorkflow(workflowId),
    onSuccess: () => {
      router.push('/workflows');
      toast({
        title: "Success",
        description: "Workflow deleted successfully.",
      })
    },
    onError: (error) => {
      console.error('Error deleting workflow:', error);
      toast({
        title: "Error",
        description: "Failed to delete workflow.",
        variant: "destructive",
      })
    },
  });

  useEffect(() => {
    if (workflowId && isTemporaryId(workflowId)) {
      setIsWorkflowNameDialogOpen(true);
    }
  }, [workflowId, isTemporaryId]);

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleAddNode = useCallback(
    (type: string, category: string, label: string) => {
      if (!reactFlowInstance) return;

      const id = String(nodes.length + 1);
      const position = reactFlowInstance.project({ x: 0, y: 0 }); // Default position
      const newNode: WorkflowNode = {
        id: id,
        type: type,
        position,
        data: { label: label, type: type, config: {} },
      };

      setNodes((nds) => nds.concat(newNode));
      setIsNodeLibraryOpen(false);
    },
    [nodes, setNodes, reactFlowInstance]
  );

  const handleNodeConfigChange = useCallback(
    (updatedConfig: any) => {
      if (!selectedNode) return;

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                config: updatedConfig,
              },
            };
          }
          return node;
        })
      );
    },
    [selectedNode, setNodes]
  );

  const handleSaveWorkflow = useCallback(async () => {
    setIsSaving(true);
    try {
      if (!workflowId) {
        throw new Error('Workflow ID is missing.');
      }

      const workflowDefinition: WorkflowDefinition = {
        nodes: nodes,
        edges: edges,
      };

      saveWorkflow(workflowDefinition);
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: "Error",
        description: "Failed to save workflow.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, workflowId, saveWorkflow, toast]);

  const handleDuplicateNode = useCallback(() => {
    if (!selectedNode || !reactFlowInstance) return;

    const id = String(nodes.length + 1);
    const position = reactFlowInstance.project({
      x: selectedNode.position.x + 50,
      y: selectedNode.position.y + 50,
    });

    const newNode: WorkflowNode = {
      id: id,
      type: selectedNode.type,
      position,
      data: { ...selectedNode.data, label: `${selectedNode.data.label} Copy` },
    };

    setNodes((nds) => nds.concat(newNode));
    setSelectedNode(newNode);
  }, [selectedNode, setNodes, reactFlowInstance, nodes]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return;

    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
    );
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  const handleCloseConfig = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleWorkflowNameSubmit = useCallback(async (name: string) => {
    if (!workflowId) return;

    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      await workflowService.updateWorkflowName(dbWorkflowId, name);
      setWorkflowName(name);
      setIsWorkflowNameDialogOpen(false);
      toast({
        title: "Success",
        description: "Workflow name updated successfully.",
      })
    } catch (error) {
      console.error('Error updating workflow name:', error);
      toast({
        title: "Error",
        description: "Failed to update workflow name.",
        variant: "destructive",
      })
    }
  }, [workflowId, convertToDbWorkflowId, setWorkflowName, toast]);

  const onEdgesUpdate = useCallback((updates) => {
    edgeUpdateSuccessful.current = false;

    setEdges((eds) =>
      eds.map((edge) => {
        const update = updates.find((u) => u.id === edge.id);

        if (update) {
          return { ...edge, ...update };
        }

        return edge;
      })
    );
  }, [setEdges]);

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = true;
  }, []);

  const onEdgeUpdate = useCallback((oldEdge, newConnection) => {
    edgeUpdateSuccessful.current = false;
    setEdges((eds) => updateEdge(oldEdge, newConnection, eds));
  }, [setEdges]);

  const onEdgeUpdateEnd = useCallback((edge) => {
    if (!edgeUpdateSuccessful.current) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
  }, [setEdges]);

  return (
    <div className="flex h-screen">
      {/* Workflow Canvas */}
      <div className="flex-1 relative">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            onLoad={setReactFlowInstance}
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              animated: true,
              style: {
                stroke: '#9CA3AF',
              },
            }}
            onEdgesUpdate={onEdgesUpdate}
            onEdgeUpdateStart={onEdgeUpdateStart}
            onEdgeUpdate={onEdgeUpdate}
            onEdgeUpdateEnd={onEdgeUpdateEnd}
          >
            <Controls />
            <MiniMap />
            <Background color="#444" variant="dots" gap={12} size={1} />
          </ReactFlow>

          {/* Top Bar */}
          <Panel className="absolute top-0 left-0 right-0 z-10 bg-white border-b border-gray-200">
            <div className="container mx-auto py-2 px-4 flex items-center justify-between">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold mr-4">{workflowName || 'Untitled Workflow'}</h1>
                <Button variant="outline" size="sm" onClick={() => setIsWorkflowNameDialogOpen(true)}>
                  Rename
                </Button>
              </div>
              <div className="space-x-2">
                <Button onClick={() => setIsNodeLibraryOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Node
                </Button>
                <Button onClick={handleSaveWorkflow} disabled={isSaving || isSaveLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving || isSaveLoading ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={() => createWorkflowCopy(workflowId as string)} disabled={isCopyLoading}>
                  <Copy className="h-4 w-4 mr-2" />
                  {isCopyLoading ? 'Duplicating...' : 'Duplicate'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your workflow and remove your
                        data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteWorkflow(workflowId as string)} disabled={isDeleteLoading}>
                        {isDeleteLoading ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Panel>

          {/* Node Library */}
          <NodeLibrary isOpen={isNodeLibraryOpen} onClose={() => setIsNodeLibraryOpen(false)} onAddNode={handleAddNode} />

          <AlertDialog open={isWorkflowNameDialogOpen} onOpenChange={setIsWorkflowNameDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Name your workflow</AlertDialogTitle>
                <AlertDialogDescription>
                  Give your workflow a name to easily identify it later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input id="name" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleWorkflowNameSubmit(workflowName)}>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ReactFlowProvider>
      </div>

      {/* Node Configuration Panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onConfigChange={handleNodeConfigChange}
          onDelete={handleDeleteNode}
          onDuplicate={handleDuplicateNode}
          onClose={handleCloseConfig}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
};

export default WorkflowBuilder;
