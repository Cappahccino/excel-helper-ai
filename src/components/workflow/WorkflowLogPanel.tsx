
import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, X, ArrowDown, ArrowUp, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface WorkflowLogPanelProps {
  workflowId: string | null;
  executionId: string | null;
  selectedNodeId?: string | null;
  trigger?: React.ReactNode;
}

const WorkflowLogPanel: React.FC<WorkflowLogPanelProps> = ({ 
  workflowId, 
  executionId, 
  selectedNodeId,
  trigger
}) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('workflow');
  const [open, setOpen] = useState(false);
  
  const fetchLogs = async () => {
    if (!executionId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('workflow_step_logs')
        .select('*')
        .eq('execution_id', executionId)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching workflow logs:', err);
      setError('Failed to load workflow logs');
      toast.error('Failed to load workflow logs');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch logs when the dialog is opened or executionId changes
  useEffect(() => {
    if (open && executionId) {
      fetchLogs();
    }
  }, [open, executionId]);
  
  // Set active tab based on selected node
  useEffect(() => {
    if (selectedNodeId) {
      setActiveTab('node');
    } else {
      setActiveTab('workflow');
    }
  }, [selectedNodeId]);
  
  // Filter logs for selected node
  const filteredLogs = selectedNodeId 
    ? logs.filter(log => log.node_id === selectedNodeId)
    : logs;
  
  const renderLogContent = (log: any) => {
    return (
      <div key={log.id} className="border rounded p-3 mb-3 bg-white">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Badge variant={log.status === 'success' ? 'success' : 'destructive'}>
              {log.status}
            </Badge>
            <span className="text-xs text-gray-500">
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{log.node_type}</Badge>
            <Badge variant="outline">{log.execution_time_ms}ms</Badge>
          </div>
        </div>
        
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Input Data
          </summary>
          <pre className="text-xs bg-gray-50 p-2 mt-1 rounded overflow-x-auto">
            {JSON.stringify(log.input_data, null, 2)}
          </pre>
        </details>
        
        <details className="text-sm mt-2">
          <summary className="cursor-pointer font-medium">
            Output Data
          </summary>
          <pre className="text-xs bg-gray-50 p-2 mt-1 rounded overflow-x-auto">
            {JSON.stringify(log.output_data, null, 2)}
          </pre>
        </details>
        
        {log.cell_changes && log.cell_changes.has_changes && (
          <details className="text-sm mt-2">
            <summary className="cursor-pointer font-medium">
              Data Changes
            </summary>
            <div className="text-xs bg-gray-50 p-2 mt-1 rounded">
              <div>
                <span className="font-medium">Added Headers:</span> 
                <span className="ml-1">{log.cell_changes.added_headers?.length || 0}</span>
              </div>
              <div>
                <span className="font-medium">Removed Headers:</span> 
                <span className="ml-1">{log.cell_changes.removed_headers?.length || 0}</span>
              </div>
            </div>
          </details>
        )}
      </div>
    );
  };
  
  const defaultTrigger = (
    <Button variant="outline" className="flex items-center gap-2">
      <FileText className="h-4 w-4" />
      Workflow Logs
    </Button>
  );
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Workflow Execution Logs</DialogTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchLogs} 
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <Tabs 
          defaultValue="workflow" 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <TabsList>
            <TabsTrigger value="workflow">All Nodes</TabsTrigger>
            <TabsTrigger 
              value="node" 
              disabled={!selectedNodeId}
            >
              Selected Node
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="workflow" className="flex-1 mt-4">
            {error ? (
              <div className="flex items-center justify-center h-full text-red-500">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {error}
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading workflow logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <FileText className="mr-2 h-4 w-4" />
                No logs available for this workflow execution
              </div>
            ) : (
              <ScrollArea className="h-full pr-4">
                {logs.map(renderLogContent)}
              </ScrollArea>
            )}
          </TabsContent>
          
          <TabsContent value="node" className="flex-1 mt-4">
            {!selectedNodeId ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a node to view its logs
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <FileText className="mr-2 h-4 w-4" />
                No logs available for the selected node
              </div>
            ) : (
              <ScrollArea className="h-full pr-4">
                {filteredLogs.map(renderLogContent)}
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowLogPanel;
