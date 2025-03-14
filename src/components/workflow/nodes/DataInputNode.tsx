
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, GripVertical, FileText, Globe, User, ChevronDown } from 'lucide-react';
import { NodeProps, DataInputNodeData } from '@/types/workflow';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow } from '../context/WorkflowContext';

// Default data if none is provided
const defaultData: DataInputNodeData = {
  label: 'Data Input',
  type: 'excelInput',
  config: {}
};

const DataInputNode: React.FC<NodeProps<DataInputNodeData>> = ({ data, selected, id }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as DataInputNodeData : defaultData;
  const workflow = useWorkflow();
  
  const [sheets, setSheets] = useState<{ name: string, index: number, rowCount: number, isDefault: boolean }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | undefined>(undefined);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);

  // Fetch available sheets when the node is selected
  useEffect(() => {
    const fetchSheets = async () => {
      if (nodeData.type === 'excelInput' && nodeData.config?.fileId && workflow.getNodeSheets) {
        setIsLoadingSheets(true);
        try {
          const sheetsData = await workflow.getNodeSheets(id);
          if (sheetsData && sheetsData.length > 0) {
            setSheets(sheetsData);
            
            // Set selected sheet based on node config or default
            const currentSelectedSheet = nodeData.config?.selectedSheet || 
                                       sheetsData.find(s => s.isDefault)?.name || 
                                       sheetsData[0]?.name;
            setSelectedSheet(currentSelectedSheet);
          }
        } catch (error) {
          console.error('Error fetching sheets:', error);
        } finally {
          setIsLoadingSheets(false);
        }
      }
    };
    
    if (selected) {
      fetchSheets();
    }
  }, [selected, id, nodeData.type, nodeData.config?.fileId, workflow.getNodeSheets, nodeData.config?.selectedSheet]);

  // Handle sheet selection
  const handleSheetSelect = async (sheetName: string) => {
    if (workflow.setNodeSelectedSheet && id) {
      setSelectedSheet(sheetName);
      
      try {
        await workflow.setNodeSelectedSheet(id, sheetName);
        
        // Propagate schema to connected nodes
        // Get connected nodes from edges
        if (workflow.workflowId && workflow.getEdges) {
          const edges = await workflow.getEdges(workflow.workflowId);
          const targetNodes = edges
            .filter(edge => edge.source === id)
            .map(edge => edge.target);
            
          // Propagate schema to each target node
          for (const targetNodeId of targetNodes) {
            await workflow.propagateFileSchema(id, targetNodeId, sheetName);
          }
        }
      } catch (error) {
        console.error('Error setting selected sheet:', error);
      }
    }
  };

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'excelInput':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'csvInput':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'apiSource':
        return <Globe className="h-4 w-4 text-blue-500" />;
      case 'userInput':
        return <User className="h-4 w-4 text-blue-500" />;
      default:
        return <Database className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-blue-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Input type specific display */}
        {nodeData.type === 'excelInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{nodeData.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            
            {nodeData.config?.fileId && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span>Headers:</span>
                  <span className="font-medium">{nodeData.config?.hasHeaders ? 'Yes' : 'No'}</span>
                </div>
                
                {/* Sheet selector */}
                <div className="flex items-center justify-between mt-2">
                  <span>Sheet:</span>
                  {sheets.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="xs" className="h-6 px-2 text-xs">
                          {selectedSheet || 'Select Sheet'}
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuLabel>Available Sheets</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {sheets.map((sheet) => (
                          <DropdownMenuItem 
                            key={sheet.name}
                            onClick={() => handleSheetSelect(sheet.name)}
                            className="flex items-center justify-between"
                          >
                            <span>{sheet.name}</span>
                            {sheet.name === selectedSheet && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Selected
                              </Badge>
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="font-medium text-xs">
                      {isLoadingSheets ? 'Loading...' : 'No sheets'}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        
        {nodeData.type === 'csvInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{nodeData.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delimiter:</span>
              <span className="font-medium">{nodeData.config?.delimiter || ','}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'apiSource' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>API Endpoint:</span>
              <span className="font-medium">{nodeData.config?.endpoint ? 'Configured' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'userInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Form fields:</span>
              <span className="font-medium">{nodeData.config?.fields?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#3b82f6',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(DataInputNode);
