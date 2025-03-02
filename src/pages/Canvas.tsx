
// src/pages/Canvas.tsx
import React from 'react';
import { ChatSidebar } from '@/components/ChatSidebar';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from '@/hooks/use-toast';
import { useParams } from 'react-router-dom';
import { ExtendedDatabase } from '@/types/supabase';

// Type assertion to use extended Supabase client
const extendedSupabase = supabase as unknown as typeof supabase & {
  from<T extends keyof ExtendedDatabase['Tables']>(
    table: T
  ): ReturnType<typeof supabase.from>;
  rpc<T extends keyof ExtendedDatabase['Functions']>(
    fn: T,
    params?: ExtendedDatabase['Functions'][T]['Args']
  ): ReturnType<typeof supabase.rpc>;
};

const Canvas = () => {
  const { toast } = useToast();
  const { workflowId } = useParams();
  const [initialNodes, setInitialNodes] = React.useState([]);
  const [initialEdges, setInitialEdges] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(!!workflowId);

  // Load workflow if workflowId is provided
  React.useEffect(() => {
    if (workflowId) {
      const loadWorkflow = async () => {
        try {
          const { data, error } = await extendedSupabase
            .from('workflows')
            .select('*')
            .eq('id', workflowId)
            .single();

          if (error) throw error;

          if (data?.definition) {
            setInitialNodes(data.definition.nodes || []);
            setInitialEdges(data.definition.edges || []);
          }
        } catch (error) {
          console.error('Error loading workflow:', error);
          toast({
            title: 'Error',
            description: 'Failed to load workflow',
            variant: 'destructive',
          });
        } finally {
          setIsLoading(false);
        }
      };

      loadWorkflow();
    }
  }, [workflowId, toast]);

  const handleSaveWorkflow = async (nodes, edges) => {
    try {
      const workflowDefinition = {
        nodes,
        edges,
      };

      if (workflowId) {
        // Update existing workflow
        await extendedSupabase
          .from('workflows')
          .update({
            definition: workflowDefinition,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workflowId);
      } else {
        // Create new workflow
        const { data, error } = await extendedSupabase
          .from('workflows')
          .insert({
            name: 'Untitled Workflow',
            description: '',
            definition: workflowDefinition,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;

        // Redirect to the workflow with ID
        window.history.pushState({}, '', `/canvas/${data.id}`);
      }

      toast({
        title: 'Success',
        description: 'Workflow saved successfully',
      });
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: 'Error',
        description: 'Failed to save workflow',
        variant: 'destructive',
      });
    }
  };

  const handleRunWorkflow = async (workflowId) => {
    try {
      // Call your workflow execution service
      const { data, error } = await extendedSupabase
        .rpc('start_workflow_execution', {
          workflow_id: workflowId
        });

      if (error) throw error;

      toast({
        title: 'Workflow Started',
        description: 'Your workflow is now running',
      });

      return data;
    } catch (error) {
      console.error('Error running workflow:', error);
      toast({
        title: 'Error',
        description: 'Failed to run workflow',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-screen w-full">
      <ChatSidebar />
      <div className="flex-1 relative ml-[60px] transition-all duration-200 sidebar-expanded:ml-[300px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-current"></div>
          </div>
        ) : (
          <WorkflowBuilder
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onSave={handleSaveWorkflow}
            onRun={handleRunWorkflow}
          />
        )}
      </div>
    </div>
  );
};

export default Canvas;
