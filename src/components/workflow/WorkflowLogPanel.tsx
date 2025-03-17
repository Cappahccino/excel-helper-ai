
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WorkflowLogPanelProps {
  workflowId: string | null;
  executionId: string | null;
  selectedNodeId?: string | null;
  nodeId?: string;  // Added to support direct nodeId passing
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  maxHeight?: string; // Added to support max height customization
}

const WorkflowLogPanel: React.FC<WorkflowLogPanelProps> = ({ 
  workflowId, 
  executionId, 
  selectedNodeId,
  nodeId, // Added nodeId prop
  isOpen = true, // Default to true if used as inline component
  onOpenChange = () => {}, // Default no-op
  trigger,
  maxHeight
}) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [nodeOptions, setNodeOptions] = useState<{id: string, type: string}[]>([]);
  const [filteredNodeId, setFilteredNodeId] = useState<string | null>(nodeId || selectedNodeId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  
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
      
      // Extract unique nodes for the filter dropdown
      const uniqueNodes = Array.from(
        new Map(
          (data || []).map(log => [
            log.node_id, 
            { id: log.node_id, type: log.node_type }
          ])
        ).values()
      );
      
      setNodeOptions(uniqueNodes);
      
      // If there's a selected node that doesn't exist in logs, reset it
      if (filteredNodeId && !uniqueNodes.some(n => n.id === filteredNodeId)) {
        setFilteredNodeId(null);
      }
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
    if (isOpen && executionId) {
      fetchLogs();
    }
  }, [isOpen, executionId]);
  
  // Set active tab based on selected node
  useEffect(() => {
    if (selectedNodeId || filteredNodeId) {
      setActiveTab('filtered');
    } else {
      setActiveTab('all');
    }
  }, [selectedNodeId, filteredNodeId]);
  
  // Filter logs for selected node
  const filteredLogs = filteredNodeId 
    ? logs.filter(log => log.node_id === filteredNodeId)
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
  
  // When used as an inline component
  if (!trigger) {
    return (
      <div style={{ maxHeight: maxHeight || '400px' }} className="overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium">Execution Logs</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchLogs} 
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {error ? (
          <div className="flex items-center justify-center h-full text-red-500 text-xs">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {error}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            <FileText className="mr-1 h-3 w-3" />
            No logs available
          </div>
        ) : (
          <ScrollArea className="h-full pr-2">
            {filteredLogs.map(renderLogContent)}
          </ScrollArea>
        )}
      </div>
    );
  }
  
  // When used as a dialog
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
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
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="mb-4">
          <Select 
            value={filteredNodeId || ''} 
            onValueChange={(value) => setFilteredNodeId(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by node" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All nodes</SelectItem>
              {nodeOptions.map(node => (
                <SelectItem key={node.id} value={node.id}>
                  {node.type} (ID: {node.id.substring(0, 8)}...)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Tabs 
          defaultValue="all" 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <TabsList>
            <TabsTrigger value="all">All Logs</TabsTrigger>
            <TabsTrigger 
              value="filtered" 
              disabled={!filteredNodeId}
            >
              Filtered Logs
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="flex-1 mt-4">
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
          
          <TabsContent value="filtered" className="flex-1 mt-4">
            {!filteredNodeId ? (
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
