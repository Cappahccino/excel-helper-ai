import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Panel,
  Connection,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AINode from '@/components/workflow/nodes/AINode';
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';

import NodeLibrary from '@/components/workflow/NodeLibrary';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Play, Plus } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
};

const nodeCategories = [
  {
    id: 'input',
    name: 'Data Input',
    items: [
      { type: 'dataInput', label: 'Data Input', description: 'Import data from external sources' },
    ]
  },
  {
    id: 'processing',
    name: 'Data Processing',
    items: [
      { type: 'dataProcessing', label: 'Data Processing', description: 'Transform and process data' },
    ]
  },
  {
    id: 'ai',
    name: 'AI & Analysis',
    items: [
      { type: 'aiNode', label: 'AI Node', description: 'Apply AI and ML algorithms to data' },
    ]
  },
  {
    id: 'output',
    name: 'Output',
    items: [
      { type: 'outputNode', label: 'Output Node', description: 'Export or visualize processed data' },
    ]
  },
  {
    id: 'integration',
    name: 'Integrations',
    items: [
      { type: 'integrationNode', label: 'Integration Node', description: 'Connect with external services' },
    ]
  },
  {
    id: 'control',
    name: 'Control Flow',
    items: [
      { type: 'controlNode', label: 'Control Node', description: 'Control the workflow execution path' },
    ]
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheets',
    items: [
      { type: 'spreadsheetGenerator', label: 'Spreadsheet Generator', description: 'Generate Excel or CSV files' },
    ]
  },
];

const Canvas = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState<string>('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      loadWorkflow();
    }
  }, [workflowId]);

  const loadWorkflow = async () => {
    if (!workflowId || workflowId === 'new') return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setWorkflowName(data.name);
        setWorkflowDescription(data.description);
        
        const definition = typeof data.definition === 'string' 
          ? JSON.parse(data.definition) 
          : data.definition;
        
        setNodes(definition.nodes || []);
        setEdges(definition.edges || []);
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const saveWorkflow = async () => {
    try {
      setIsSaving(true);
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      if (!userId) {
        toast.error('User not authenticated');
        return;
      }
      
      const workflow = {
        name: workflowName,
        description: workflowDescription,
        definition: JSON.stringify({
          nodes,
          edges,
        }),
        user_id: userId,
        created_by: userId,
      };
      
      let response;
      
      if (workflowId && workflowId !== 'new') {
        response = await supabase
          .from('workflows')
          .update(workflow)
          .eq('id', workflowId);
      } else {
        response = await supabase
          .from('workflows')
          .insert(workflow);
      }
      
      if (response.error) throw response.error;
      
      toast.success('Workflow saved successfully');
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflow = async () => {
    if (!workflowId || workflowId === 'new') {
      toast.error('Please save the workflow before running it');
      return;
    }

    try {
      const { data, error } = await supabase
        .rpc('start_workflow_execution', { workflow_id: workflowId });

      if (error) throw error;
      
      toast.success('Workflow execution started');
      
      if (data && typeof data === 'object' && 'execution_id' in data) {
        console.log('Execution ID:', data.execution_id);
      }
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Failed to run workflow');
    }
  };

  const handleAddNode = (nodeType: string, nodeCategory: string, nodeLabel: string) => {
    const nodeId = `node-${uuidv4()}`;
    
    const nodeComponentType = (() => {
      switch (nodeCategory) {
        case 'input': return 'dataInput';
        case 'processing': return 'dataProcessing';
        case 'ai': return 'aiNode';
        case 'output': return 'outputNode';
        case 'integration': return 'integrationNode';
        case 'control': return 'controlNode';
        case 'spreadsheet': return 'spreadsheetGenerator';
        default: return 'dataInput';
      }
    })();

    const newNode = {
      id: nodeId,
      type: nodeComponentType,
      position: { x: 100, y: 100 },
      data: {
        label: nodeLabel || 'New Node',
        type: nodeType,
        config: {}
      }
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);
    toast.success(`Added ${nodeLabel} node to canvas`);
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-4 flex justify-between items-center">
        <div className="flex-1 mr-4">
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-xl font-bold mb-2"
            placeholder="Workflow Name"
          />
          <Textarea
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            className="text-sm resize-none"
            placeholder="Describe your workflow..."
            rows={2}
          />
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={saveWorkflow} 
            disabled={isSaving}
            className="flex items-center"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button 
            onClick={runWorkflow} 
            variant="outline"
            className="flex items-center"
          >
            <Play className="mr-2 h-4 w-4" />
            Run
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex">
        <Tabs defaultValue="canvas" className="w-full">
          <TabsList className="px-4 pt-2">
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="canvas" className="flex-1 h-full">
            <div className="h-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={setNodes}
                onEdgesChange={setEdges}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
              >
                <Controls />
                <MiniMap />
                <Background />
                <Panel position="top-right">
                  <Button onClick={() => setIsAddingNode(true)} className="flex items-center">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Node
                  </Button>
                </Panel>
              </ReactFlow>
            </div>
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Configure additional workflow settings here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <NodeLibrary
        isOpen={isAddingNode}
        onClose={() => setIsAddingNode(false)}
        onAddNode={handleAddNode}
        nodeCategories={nodeCategories}
      />
    </div>
  );
};

export default Canvas;
