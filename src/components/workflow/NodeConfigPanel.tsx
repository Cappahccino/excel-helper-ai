
import React from 'react';
import { X, Trash, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose
} from '@/components/ui/sheet';
import { WorkflowNode, NodeConfigPanelProps } from '@/types/workflow';
import AskAINodeConfig from './AskAINodeConfig';

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  onUpdateConfig,
  onDelete,
  onDuplicate,
  onClose,
  readOnly = false
}) => {
  // Function to update node config
  const handleUpdate = (updatedData: any) => {
    const updatedConfig = {
      ...node,
      ...updatedData,
      config: {
        ...node.data.config,
        ...(updatedData.config || {})
      }
    };
    onUpdateConfig(updatedConfig);
  };

  // Render the correct config panel based on node type
  const renderConfigPanel = () => {
    if (node.type === 'askAI') {
      return (
        <AskAINodeConfig
          data={node.data}
          onUpdate={handleUpdate}
        />
      );
    }

    // Default config panel for other node types
    return (
      <div className="p-4">
        <p className="text-center text-gray-500">
          Configuration options for {node.data.label || node.type} will appear here.
        </p>
      </div>
    );
  };

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{node?.data.label || node?.type}</SheetTitle>
          <SheetDescription>
            Configure this node's settings and parameters.
          </SheetDescription>
        </SheetHeader>
        
        {node && (
          <div className="mt-4 space-y-4">
            {renderConfigPanel()}
            
            {!readOnly && (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDuplicate}
                  className="flex items-center"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Duplicate
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  className="flex items-center"
                >
                  <Trash className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Close
                  </Button>
                </SheetClose>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default NodeConfigPanel;
