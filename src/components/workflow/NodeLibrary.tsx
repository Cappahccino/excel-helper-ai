
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { NodeLibraryProps, NodeComponentType } from '@/types/workflow';

const NodeLibrary = ({ isOpen, onClose, onAddNode, nodeCategories }: NodeLibraryProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleAddNode = (nodeType: string, nodeCategory: string, nodeLabel: string) => {
    if (onAddNode) {
      onAddNode(nodeType, nodeCategory, nodeLabel);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Node</DialogTitle>
          <DialogDescription>
            Select a node type to add to your workflow.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-1 gap-4 mt-4 min-h-0">
          {/* Categories sidebar */}
          <div className="w-1/4 border-r pr-4">
            <div className="space-y-2">
              {nodeCategories?.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "ghost"}
                  className="w-full justify-start text-left"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Node items */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 gap-4 p-1">
              {selectedCategory
                ? nodeCategories
                    ?.find((cat) => cat.id === selectedCategory)
                    ?.items.map((item) => (
                      <Button
                        key={item.type}
                        variant="outline"
                        className="flex flex-col h-24 p-3 gap-2 hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddNode(item.type, selectedCategory, item.label)}
                      >
                        <div className="flex items-center gap-2">
                          {item.icon && <span>{item.icon}</span>}
                          <span className="font-medium">{item.label}</span>
                        </div>
                        {item.description && (
                          <span className="text-xs text-muted-foreground line-clamp-2 text-left">
                            {item.description}
                          </span>
                        )}
                      </Button>
                    ))
                : nodeCategories?.flatMap((category) =>
                    category.items.map((item) => (
                      <Button
                        key={`${category.id}-${item.type}`}
                        variant="outline"
                        className="flex flex-col h-24 p-3 gap-2 hover:bg-gray-50 transition-colors"
                        onClick={() => handleAddNode(item.type, category.id, item.label)}
                      >
                        <div className="flex items-center gap-2">
                          {item.icon && <span>{item.icon}</span>}
                          <span className="font-medium">{item.label}</span>
                        </div>
                        {item.description && (
                          <span className="text-xs text-muted-foreground line-clamp-2 text-left">
                            {item.description}
                          </span>
                        )}
                      </Button>
                    ))
                  )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NodeLibrary;
