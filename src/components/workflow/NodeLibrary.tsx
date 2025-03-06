
import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, FileSpreadsheet, Filter, SortAsc, Calculator, FormInput, Type, Calendar, LayoutGrid, GitMerge, Copy } from 'lucide-react';
import { NodeLibraryProps, ProcessingNodeType } from '@/types/workflow';

const NodeLibrary: React.FC<NodeLibraryProps> = ({
  isOpen,
  onClose,
  onAddNode,
  nodeCategories = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  
  // Define processing node types that are available to add
  const processingNodeTypes: { type: ProcessingNodeType; label: string; description: string; icon: React.ReactNode }[] = [
    { 
      type: 'filtering', 
      label: 'Filtering', 
      description: 'Filter data based on conditions', 
      icon: <Filter className="h-4 w-4" />
    },
    { 
      type: 'sorting', 
      label: 'Sorting', 
      description: 'Sort data by specific criteria', 
      icon: <SortAsc className="h-4 w-4" />
    },
    { 
      type: 'aggregation', 
      label: 'Aggregation', 
      description: 'Compute sums, averages, counts, etc.', 
      icon: <Calculator className="h-4 w-4" />
    },
    { 
      type: 'formulaCalculation', 
      label: 'Formula Calculation', 
      description: 'Apply Excel-like formulas', 
      icon: <FormInput className="h-4 w-4" />
    },
    { 
      type: 'textTransformation', 
      label: 'Text Transformation', 
      description: 'Apply text operations', 
      icon: <Type className="h-4 w-4" />
    },
    { 
      type: 'dataTypeConversion', 
      label: 'Data Type Conversion', 
      description: 'Convert between data types', 
      icon: <FileSpreadsheet className="h-4 w-4" />
    },
    { 
      type: 'dateFormatting', 
      label: 'Date Formatting', 
      description: 'Format date values', 
      icon: <Calendar className="h-4 w-4" />
    },
    { 
      type: 'pivotTable', 
      label: 'Pivot Table', 
      description: 'Create pivot tables', 
      icon: <LayoutGrid className="h-4 w-4" />
    },
    { 
      type: 'joinMerge', 
      label: 'Join/Merge', 
      description: 'Combine multiple datasets', 
      icon: <GitMerge className="h-4 w-4" />
    },
    { 
      type: 'deduplication', 
      label: 'Deduplication', 
      description: 'Remove duplicate entries', 
      icon: <Copy className="h-4 w-4" />
    }
  ];
  
  // Enhance nodeCategories with processing node types if processing category exists
  const enhancedCategories = useMemo(() => {
    return nodeCategories.map(category => {
      if (category.id === 'processing') {
        // Replace the items with our dynamic processing node types
        return {
          ...category,
          items: processingNodeTypes.map(node => ({
            type: node.type,
            label: node.label,
            description: node.description,
            icon: node.icon
          }))
        };
      }
      return category;
    });
  }, [nodeCategories]);
  
  // Filter nodes based on search term and active tab
  const filteredCategories = useMemo(() => {
    let filteredByTab = enhancedCategories;
    
    // Filter by tab first if not 'all'
    if (activeTab !== 'all') {
      filteredByTab = enhancedCategories.filter(category => {
        return category.id === activeTab;
      });
    }
    
    // Then filter by search term
    if (!searchTerm.trim()) {
      return filteredByTab;
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return filteredByTab.filter(category => {
      // If the category matches, include it
      if (category.name.toLowerCase().includes(lowerSearchTerm)) {
        return true;
      }
      
      // Filter items within the category
      const filteredItems = category.items.filter(item => 
        item.label.toLowerCase().includes(lowerSearchTerm) || 
        (item.description && item.description.toLowerCase().includes(lowerSearchTerm))
      );
      
      // Include the category if it has matching items
      return filteredItems.length > 0;
    }).map(category => {
      // Only include matching items within each category
      return {
        ...category,
        items: category.items.filter(item => 
          item.label.toLowerCase().includes(lowerSearchTerm) || 
          (item.description && item.description.toLowerCase().includes(lowerSearchTerm))
        )
      };
    });
  }, [searchTerm, activeTab, enhancedCategories]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
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
        
        <Tabs 
          defaultValue="all" 
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="w-full justify-start mb-4 overflow-x-auto flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="input">Inputs</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="ai">AI & ML</TabsTrigger>
            <TabsTrigger value="integration">Integrations</TabsTrigger>
            <TabsTrigger value="output">Outputs</TabsTrigger>
            <TabsTrigger value="control">Control Flow</TabsTrigger>
            <TabsTrigger value="utility">Utilities</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-0">
            {filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No nodes match your search
              </div>
            ) : (
              <div className="space-y-6">
                {filteredCategories.map((category) => (
                  <div key={category.id} className="mb-6">
                    <h3 className="text-sm font-medium mb-2 flex items-center">
                      {category.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {category.items.map((item) => (
                        <Button
                          key={item.type}
                          variant="outline"
                          className="justify-start h-auto py-3 px-4"
                          onClick={(e) => {
                            e.preventDefault();
                            onAddNode?.(item.type, category.id, item.label);
                            onClose();
                          }}
                          type="button"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className="p-1.5 rounded-md bg-blue-100">
                              {React.isValidElement(item.icon) ? item.icon : <FileSpreadsheet className="h-4 w-4 text-blue-500" />}
                            </div>
                            <div className="text-left">
                              <div className="font-medium">{item.label}</div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
                              )}
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default NodeLibrary;
