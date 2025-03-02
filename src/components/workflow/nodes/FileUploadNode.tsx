
import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileUp, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NodeProps, FileUploadNodeData } from '@/types/workflow';

const FileUploadNode: React.FC<NodeProps<FileUploadNodeData>> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const label = data?.label || 'File Upload';
  
  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <FileUp className="h-4 w-4 mr-2 text-blue-500" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          
          <div className="border rounded p-2 min-h-[80px] flex flex-col items-center justify-center bg-gray-50">
            <FileText className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-center text-muted-foreground">
              Drag & drop files here
            </p>
          </div>
          
          <div className="flex justify-center">
            <Button size="sm" className="w-full text-xs">
              <FileUp className="h-3 w-3 mr-1" />
              Browse Files
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            <Label className="mb-1 block">Supported formats:</Label>
            <p>Excel, CSV, JSON, and other structured files</p>
          </div>
        </div>
      </CardContent>
      
      {/* Input handle at the top */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="w-2 h-2 !bg-blue-500"
      />
      
      {/* Output handle at the bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
};

export default FileUploadNode;
