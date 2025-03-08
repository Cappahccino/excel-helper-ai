
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Handle, Position } from '@xyflow/react';
import { FileText, Upload, RefreshCw, Database, AlertCircle, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { FileUploadNodeData } from '@/types/workflow';
import { useWorkflow } from '../context/WorkflowContext';
import { useDebounce } from '@/hooks/useDebounce';

interface FileUploadNodeProps {
  id: string;
  selected: boolean;
  data: FileUploadNodeData;
}

const FileUploadNode: React.FC<FileUploadNodeProps> = ({ id, data, selected }) => {
  const { workflowId } = useWorkflow();
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(
    data.config?.fileId
  );
  const debouncedFileId = useDebounce(selectedFileId, 300); // Debounce file ID to prevent flickering
  const [isLoading, setIsLoading] = useState(false);
  const [fileSuccess, setFileSuccess] = useState(false);
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  
  // Query to fetch available files
  const { data: files, isLoading: isLoadingFiles, refetch } = useQuery({
    queryKey: ['excel-files-for-workflow'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load files');
        throw error;
      }

      return data || [];
    },
  });

  // Query to get selected file info
  const { data: selectedFile, isLoading: isLoadingSelectedFile } = useQuery({
    queryKey: ['excel-file-info', debouncedFileId], // Use debounced ID to prevent unnecessary queries
    queryFn: async () => {
      if (!debouncedFileId) return null;

      const { data, error } = await supabase
        .from('excel_files')
        .select('*, file_metadata(*)')
        .eq('id', debouncedFileId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching file info:', error);
        return null;
      }

      return data;
    },
    enabled: !!debouncedFileId,
  });

  // Update file info when selected file changes
  useEffect(() => {
    if (selectedFile) {
      setFileInfo(selectedFile);
      // Clear any previous errors when file loads successfully
      setProcessingError(null);
    }
  }, [selectedFile]);

  // Format file size for display
  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file selection
  const handleFileSelection = async (fileId: string) => {
    if (!fileId) return;
    
    try {
      // Skip processing if this file is already selected and processed
      if (fileId === selectedFileId && fileInfo && fileInfo.processing_status === 'completed') {
        return;
      }
      
      setIsLoading(true);
      setProcessingError(null); // Clear any previous errors
      setSelectedFileId(fileId);
      
      // Validate workflow ID availability
      if (!workflowId) {
        setProcessingError("No workflow ID available. Please save the workflow first.");
        toast.error('Cannot associate file with workflow yet. Please save the workflow.');
        setIsLoading(false);
        return;
      }
      
      // Log the workflow ID for debugging
      console.log(`Associating file ${fileId} with node ${id} in workflow ${workflowId}`);
      
      // Associate the file with this node in the workflow - no need to convert temp ID
      const { error } = await supabase
        .from('workflow_files')
        .upsert({
          workflow_id: workflowId, // Use ID as-is - both temp and permanent IDs are handled
          node_id: id,
          file_id: fileId,
          status: 'selected',
          is_active: true,
          processing_status: 'queued'
        });
      
      if (error) {
        console.error('Error creating workflow file association:', error);
        setProcessingError(`Database error: ${error.message}`);
        toast.error('Failed to associate file with workflow node');
        throw error;
      }
      
      // Queue the file for processing with improved error handling
      try {
        const response = await supabase.functions.invoke('processFile', {
          body: {
            fileId,
            workflowId: workflowId, // Send workflow ID as-is
            nodeId: id
          }
        });
        
        if (response.error) {
          console.error('Error invoking processFile function:', response.error);
          setProcessingError(`Processing error: ${response.error.message}`);
          toast.error('Failed to queue file for processing');
          throw response.error;
        }
        
        // Check for error in the successful response body
        const responseData = response.data;
        if (responseData && responseData.error) {
          console.error('Process file returned error:', responseData.error);
          setProcessingError(`Process error: ${responseData.error}`);
          toast.error(responseData.error);
        }
      } catch (fnError) {
        console.error('Function call failed, but association may still be valid:', fnError);
        setProcessingError(`API error: ${fnError.message}`);
        toast.error('Error processing file. Please try again.');
        // Continue execution - the association might still be valid
      }
      
      // Update node configuration
      if (data.onChange) {
        data.onChange(id, { 
          fileId, 
          filename: files?.find(f => f.id === fileId)?.filename 
        });
      }
      
      // Show success state briefly
      setFileSuccess(true);
      setTimeout(() => setFileSuccess(false), 1500);
      
      toast.success('File associated with workflow node successfully');
    } catch (error) {
      console.error('Error associating file with workflow node:', error);
      toast.error('Failed to associate file with workflow');
      setProcessingError(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get file schema columns
  const getSchemaInfo = () => {
    if (!fileInfo?.file_metadata?.column_definitions) return null;
    
    const columnDefs = fileInfo.file_metadata.column_definitions;
    const columns = Object.keys(columnDefs).map(key => ({
      name: key,
      type: columnDefs[key].type || 'string'
    }));
    
    if (!columns.length) return null;
    
    return (
      <div className="mt-3 border-t pt-2">
        <h4 className="text-xs font-semibold mb-1">File Schema</h4>
        <div className="max-h-28 overflow-y-auto pr-1 custom-scrollbar">
          {columns.map((column, index) => (
            <div 
              key={index} 
              className="text-xs flex gap-2 items-center p-1 border-b border-gray-100 last:border-0"
            >
              <span className="font-medium truncate max-w-28">{column.name}</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {column.type}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`p-4 rounded-md border-2 ${selected ? 'border-primary' : 'border-gray-200'} bg-white shadow-md w-72`}>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="font-medium text-sm">{data.label || 'File Upload'}</h3>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0" 
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor="fileSelect" className="text-xs font-medium">
            Select File
          </Label>
          
          {isLoadingFiles ? (
            <Skeleton className="h-9 w-full mt-1" />
          ) : (
            <Select 
              value={selectedFileId} 
              onValueChange={handleFileSelection}
              disabled={isLoading}
            >
              <SelectTrigger id="fileSelect" className="mt-1">
                <SelectValue placeholder="Choose a file..." />
              </SelectTrigger>
              <SelectContent>
                {files?.length === 0 ? (
                  <div className="py-6 px-2 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No files found</p>
                  </div>
                ) : (
                  files?.map((file) => (
                    <SelectItem key={file.id} value={file.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[180px]">{file.filename}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Processing file...</span>
          </div>
        )}
        
        {fileSuccess && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <Check className="h-3 w-3" />
            <span>File ready</span>
          </div>
        )}
        
        {processingError && (
          <div className="bg-red-50 p-2 rounded-md border border-red-100 text-xs text-red-600 flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">Error:</span> {processingError}
            </div>
          </div>
        )}
        
        {selectedFileId && fileInfo && !isLoading && !isLoadingSelectedFile && (
          <div className="bg-gray-50 p-2 rounded-md border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-500" />
              <h4 className="font-medium text-xs truncate">{fileInfo.filename}</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Upload className="h-3 w-3" />
                <span>{formatFileSize(fileInfo.file_size || 0)}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                <span>
                  {fileInfo.file_metadata?.row_count 
                    ? `${fileInfo.file_metadata.row_count} rows` 
                    : 'Unknown size'}
                </span>
              </div>
            </div>
            
            {fileInfo.processing_status !== 'completed' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                <Info className="h-3 w-3" />
                <span>Status: {fileInfo.processing_status}</span>
              </div>
            )}
            
            {getSchemaInfo()}
          </div>
        )}
        
        {!selectedFileId && !isLoadingFiles && (
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100">
            <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
          </div>
        )}
        
        {/* Workflow ID debugging info with improved display */}
        {workflowId && (
          <div className="mt-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis">
            WorkflowID: {workflowId.length > 20 ? `${workflowId.substring(0, 20)}...` : workflowId}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadNode;
