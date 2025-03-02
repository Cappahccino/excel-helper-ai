
// src/components/workflow/NodeLibrary.tsx

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';

interface NodeCategory {
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  nodes: string[];
}

interface NodeLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
  nodeCategories: Record<string, NodeCategory>;
}

const NodeLibrary: React.FC<NodeLibraryProps> = ({
  isOpen,
  onClose,
  onAddNode,
  nodeCategories
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Filter nodes based on search term
  const filteredCategories = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return nodeCategories;
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    const result: Record<string, NodeCategory> = {};
    
    for (const [key, category] of Object.entries(nodeCategories)) {
      if (category.label.toLowerCase().includes(lowerSearchTerm) || 
          category.description.toLowerCase().includes(lowerSearchTerm)) {
        // If the category matches, include all nodes
        result[key] = category;
      } else {
        // Filter nodes within the category
        const filteredNodes = category.nodes.filter(nodeType => {
          const nodeName = getNodeLabel(nodeType);
          return nodeName.toLowerCase().includes(lowerSearchTerm);
        });
        
        if (filteredNodes.length > 0) {
          result[key] = {
            ...category,
            nodes: filteredNodes
          };
        }
      }
    }
    
    return result;
  }, [searchTerm, nodeCategories]);
  
  // Helper function to get a readable label for a node type
  function getNodeLabel(nodeType: string): string {
    const labels: Record<string, string> = {
      excelInput: 'Excel Input',
      csvInput: 'CSV Input',
      apiSource: 'API Source',
      userInput: 'User Input',
      dataTransform: 'Transform Data',
      dataCleaning: 'Clean Data',
      formulaNode: 'Apply Formula',
      filterNode: 'Filter Data',
      aiAnalyze: 'AI Analysis',
      aiClassify: 'AI Classification',
      aiSummarize: 'AI Summary',
      xeroConnect: 'Xero Integration',
      salesforceConnect: 'Salesforce',
      googleSheetsConnect: 'Google Sheets',
      excelOutput: 'Excel Output',
      dashboardOutput: 'Dashboard',
      emailNotify: 'Email Notification',
      conditionalBranch: 'Condition',
      loopNode: 'Loop',
      mergeNode: 'Merge',
      spreadsheetGenerator: 'Spreadsheet Generator',
    };
    
    return labels[nodeType] || nodeType;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Node</DialogTitle>
        </DialogHeader>
        
        <div className="relative mb-4">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full justify-start mb-4 overflow-x-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="ai">AI & ML</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="outputs">Outputs</TabsTrigger>
          </TabsList>
          
          {Object.entries(filteredCategories).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No nodes match your search
            </div>
          ) : (
            Object.entries(filteredCategories).map(([categoryKey, category]) => (
              <div key={categoryKey} className="mb-6">
                <h3 className="text-sm font-medium mb-2 flex items-center">
                  {category.icon && <span className="mr-2">{category.icon}</span>}
                  {category.label}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">{category.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  {category.nodes.map((nodeType) => (
                    <Button
                      key={nodeType}
                      variant="outline"
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => {
                        onAddNode(nodeType);
                        onClose();
                      }}
                    >
                      <div className="text-left">
                        <div className="font-medium">{getNodeLabel(nodeType)}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default NodeLibrary;
