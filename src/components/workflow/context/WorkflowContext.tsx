
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ExcelFile } from '@/types/files';

// File schema represents the structure of an uploaded file
export interface FileSchema {
  fileId: string;
  nodeId: string;
  workflowId: string;
  columns: string[];
  headers: string[];
  previewData?: any[];
  selectedSheet?: string;
  rowCount?: number;
}

interface WorkflowContextType {
  workflowId: string | null;
  fileSchemas: FileSchema[];
  setFileSchemas: React.Dispatch<React.SetStateAction<FileSchema[]>>;
  getFileSchema: (nodeId: string) => FileSchema | undefined;
  getFileSchemaByFileId: (fileId: string) => FileSchema | undefined;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export const WorkflowProvider: React.FC<{
  children: React.ReactNode;
  workflowId?: string;
}> = ({ children, workflowId }) => {
  const [fileSchemas, setFileSchemas] = useState<FileSchema[]>([]);

  // Load existing file schemas when workflowId changes
  useEffect(() => {
    const loadFileSchemas = async () => {
      if (!workflowId) return;
      
      try {
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', workflowId);
        
        if (error) {
          console.error('Error fetching file schemas:', error);
          return;
        }
        
        if (data) {
          const schemas: FileSchema[] = data.map(schema => ({
            fileId: schema.file_id,
            nodeId: schema.node_id,
            workflowId: schema.workflow_id,
            columns: schema.columns || [],
            headers: schema.headers || [],
            previewData: schema.preview_data,
            selectedSheet: schema.selected_sheet,
            rowCount: schema.row_count
          }));
          
          setFileSchemas(schemas);
        }
      } catch (err) {
        console.error('Error loading file schemas:', err);
      }
    };
    
    loadFileSchemas();
  }, [workflowId]);

  const getFileSchema = (nodeId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.nodeId === nodeId);
  };

  const getFileSchemaByFileId = (fileId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.fileId === fileId);
  };

  return (
    <WorkflowContext.Provider value={{
      workflowId: workflowId || null,
      fileSchemas,
      setFileSchemas,
      getFileSchema,
      getFileSchemaByFileId
    }}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
};
