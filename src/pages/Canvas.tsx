
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = (params: any) => setEdges((eds) => addEdge(params, eds));

  return (
    <div className="w-full h-screen relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                className="pointer-events-auto"
                size="lg"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add a Node
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Node</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Button
                  onClick={() => {
                    setNodes([
                      {
                        id: '1',
                        type: 'default',
                        data: { label: 'New Node' },
                        position: { x: 250, y: 250 },
                      },
                    ]);
                  }}
                  className="w-full"
                >
                  Default Node
                </Button>
                <Button
                  onClick={() => {
                    setNodes([
                      {
                        id: '1',
                        type: 'input',
                        data: { label: 'Input Node' },
                        position: { x: 250, y: 250 },
                      },
                    ]);
                  }}
                  className="w-full"
                >
                  Input Node
                </Button>
                <Button
                  onClick={() => {
                    setNodes([
                      {
                        id: '1',
                        type: 'output',
                        data: { label: 'Output Node' },
                        position: { x: 250, y: 250 },
                      },
                    ]);
                  }}
                  className="w-full"
                >
                  Output Node
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
