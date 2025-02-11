
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
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Menu, PlusCircle, Search, Play, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import AskAINode from '@/components/nodes/AskAINode';

const nodeCategories = [
  {
    title: "Using AI",
    description: "Leverage AI for various tasks",
    icon: "🤖",
    nodes: ["Ask AI", "Extract Data", "Categorizer", "Summarizer", "Analyze Image"],
    moreCount: 10,
  },
  {
    title: "Web Scraping",
    description: "Extract data from websites automatically",
    icon: "🌐",
    nodes: ["Website Scraper", "Website Crawler", "Web Agent Scraper", "AI Web Browsing Agent", "Job Posting Scraper"],
  },
  {
    title: "Flow Basics",
    description: "Essential components for workflow construction",
    icon: "⚙️",
    nodes: ["Datetime", "Input"],
    moreCount: 6,
  },
];

const nodeTypes = {
  askAI: AskAINode,
};

const Canvas = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  
  const onConnect = useCallback((params: any) => {
    setEdges((eds) => [...eds, { ...params, animated: true }]);
  }, []);

  const addNewNode = (label: string) => {
    const centerX = window.innerWidth / 2 - 200; // Half of node width
    const centerY = window.innerHeight / 2 - 200; // Half of node height

    const newNode = {
      id: `${nodes.length + 1}`,
      type: 'askAI',
      position: { x: centerX, y: centerY },
      data: { label },
    };
    setNodes([...nodes, newNode]);
  };

  const NodeLibraryDialog = () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusCircle className="h-5 w-5" />
          Add Node
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-2xl p-4 rounded-lg">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold">
            <span className="text-pink-600">Node Library</span>{" "}
            <span className="text-gray-400">| Subflow Library</span>
          </h2>
          <Button variant="ghost" size="icon">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="relative mt-2">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search or ask anything..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs defaultValue="core">
          <TabsList className="flex space-x-2 mt-3 border-b pb-2">
            <TabsTrigger value="core">Core Nodes</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="triggers">Triggers</TabsTrigger>
            <TabsTrigger value="custom">Custom Nodes</TabsTrigger>
          </TabsList>

          <TabsContent value="core">
            <div className="mt-3 space-y-4">
              {nodeCategories.map((category) => (
                <Accordion key={category.title} type="single" collapsible>
                  <AccordionItem value={category.title}>
                    <AccordionTrigger className="bg-gray-50 p-3 rounded-lg border">
                      {category.title}
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <p className="text-sm text-gray-500 mb-2">{category.description}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {category.nodes.slice(0, 4).map((node) => (
                          <Button
                            key={node}
                            variant="outline"
                            className="flex items-center justify-start w-full"
                            onClick={() => addNewNode(node)}
                          >
                            {category.icon} {node}
                          </Button>
                        ))}
                        {category.moreCount && (
                          <Button variant="ghost" className="text-gray-600 text-sm">
                            ... {category.moreCount} more
                          </Button>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-screen w-screen">
        <ChatSidebar />
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <NodeLibraryDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen">
      <ChatSidebar />
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <NodeLibraryDialog />
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
          nodeTypes={nodeTypes}
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
