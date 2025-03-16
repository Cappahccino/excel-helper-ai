
import React from 'react';
import { PlusCircle, FileUp, FileInput, Database, Brain, Bar, Terminal, Zap, Filter, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface NodeSelectionMenuProps {
  onAddNode: (type: string, category: string, label: string) => void;
}

const NodeSelectionMenu: React.FC<NodeSelectionMenuProps> = ({ onAddNode }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <PlusCircle className="h-4 w-4" />
          <span>Add Node</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Node Types</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 mt-1">Input</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAddNode('fileUpload', 'input', 'File Upload')}>
            <FileUp className="mr-2 h-4 w-4" />
            <span>File Upload</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddNode('directUpload', 'input', 'Direct File Upload')}>
            <FileInput className="mr-2 h-4 w-4" />
            <span>Direct File Upload</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddNode('dataInput', 'input', 'Data Input')}>
            <Database className="mr-2 h-4 w-4" />
            <span>Data Input</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 mt-1">Processing</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAddNode('filtering', 'processing', 'Filter Data')}>
            <Filter className="mr-2 h-4 w-4" />
            <span>Filter Data</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddNode('aggregation', 'processing', 'Aggregate Data')}>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Aggregate Data</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddNode('dataProcessing', 'processing', 'Transform Data')}>
            <Zap className="mr-2 h-4 w-4" />
            <span>Transform Data</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 mt-1">AI</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAddNode('aiNode', 'ai', 'AI Analysis')}>
            <Brain className="mr-2 h-4 w-4" />
            <span>AI Analysis</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddNode('askAI', 'ai', 'Ask AI')}>
            <Terminal className="mr-2 h-4 w-4" />
            <span>Ask AI</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-gray-500 font-normal px-2 mt-1">Output</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAddNode('outputNode', 'output', 'Output')}>
            <Bar className="mr-2 h-4 w-4" />
            <span>Output</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NodeSelectionMenu;
