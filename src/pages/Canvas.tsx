
import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Menu, PlusCircle, Search, Play, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const nodeCategories = [
  {
    title: 'File Operations',
    items: ['File Reader', 'Generate File', 'Excel Reader', 'More...']
  },
  {
    title: 'AI',
    items: ['Ask AI', 'Analyze Data', 'Reconcile']
  },
  {
    title: 'Data Flow',
    items: ['Data Filter', 'Time Filter', 'Logical Flow', 'More...']
  },
  {
    title: 'Text Manipulation',
    items: ['Find and Replace', 'Split Text', 'Text Formatter', 'More...']
  }
];

const Canvas = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { toast } = useToast();
  
  const onConnect = useCallback((params: any) => {
    setEdges((eds) => [...eds, { ...params, animated: true }]);
  }, []);

  const addNewNode = (label: string) => {
    const newNode = {
      id: `${nodes.length + 1}`,
      position: { x: 250, y: Math.max(...(nodes.map(n => n.position.y) || [0])) + 100 },
      data: { label },
      type: nodes.length === 0 ? 'input' : nodes.length === 1 ? 'default' : 'output',
    };
    setNodes([...nodes, newNode]);
  };

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-50">
        <Popover>
          <PopoverTrigger asChild>
            <Button className="gap-2">
              <PlusCircle className="h-5 w-5" />
              Add Node
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search nodes..." 
                className="pl-8 mb-3"
              />
            </div>
            <Tabs defaultValue="nodes">
              <TabsList className="grid grid-cols-4 gap-2">
                <TabsTrigger value="nodes">Nodes</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
                <TabsTrigger value="triggers">Triggers</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
              <TabsContent value="nodes">
                <Accordion type="single" collapsible>
                  {nodeCategories.map((category) => (
                    <AccordionItem value={category.title} key={category.title}>
                      <AccordionTrigger>{category.title}</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-2 p-2">
                          {category.items.map((item) => (
                            <Button
                              key={item}
                              variant="outline"
                              className="w-full"
                              onClick={() => addNewNode(item)}
                            >
                              <PlusCircle className="mr-2 h-4 w-4" />
                              {item}
                            </Button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen">
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-4" align="start">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search nodes..." 
                  className="pl-8 mb-3"
                />
              </div>
              <Tabs defaultValue="nodes">
                <TabsList className="grid grid-cols-4 gap-2">
                  <TabsTrigger value="nodes">Nodes</TabsTrigger>
                  <TabsTrigger value="integrations">Integrations</TabsTrigger>
                  <TabsTrigger value="triggers">Triggers</TabsTrigger>
                  <TabsTrigger value="custom">Custom</TabsTrigger>
                </TabsList>
                <TabsContent value="nodes">
                  <Accordion type="single" collapsible>
                    {nodeCategories.map((category) => (
                      <AccordionItem value={category.title} key={category.title}>
                        <AccordionTrigger>{category.title}</AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-2 gap-2 p-2">
                            {category.items.map((item) => (
                              <Button
                                key={item}
                                variant="outline"
                                className="w-full"
                                onClick={() => addNewNode(item)}
                              >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                {item}
                              </Button>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => toast({ title: 'Workflow Started' })}>
            <Play className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => toast({ title: 'Workflow Saved' })}>
            <Save className="h-5 w-5" />
          </Button>
        </div>
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onConnect={onConnect} 
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
};

export default Canvas;
