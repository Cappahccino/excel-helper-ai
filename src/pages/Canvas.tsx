
// In the saveWorkflow function in Canvas.tsx, add the created_by field
const saveWorkflow = async () => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    if (!userId) {
      toast.error('User not authenticated');
      return;
    }
    
    const workflow = {
      name: workflowName,
      description: workflowDescription,
      definition: JSON.stringify({
        nodes,
        edges,
      }),
      user_id: userId,
      created_by: userId, // Add this to satisfy the TypeScript constraint
    };
    
    let response;
    
    if (workflowId && workflowId !== 'new') {
      // Update existing workflow
      response = await supabase
        .from('workflows')
        .update(workflow)
        .eq('id', workflowId);
    } else {
      // Create new workflow
      response = await supabase
        .from('workflows')
        .insert(workflow);
    }
    
    if (response.error) throw response.error;
    
    toast.success('Workflow saved successfully');
  } catch (error) {
    console.error('Error saving workflow:', error);
    toast.error('Failed to save workflow');
  }
};

// Fix ReactFlow import errors at the top of the file:
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Panel,
  Connection,
  NodeTypes,
} from '@xyflow/react';
