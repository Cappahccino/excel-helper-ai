import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Maximize2, Minimize2, FileText, Database, Terminal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

interface StepLogPanelProps {
  nodeId: string | null;
  executionId: string | null;
  workflowId: string | null;
  onClose: () => void;
}

interface NodeLogsCheckResult {
  has_logs: boolean;
}

interface StepLog {
  id: string;
  node_id: string;
  execution_id: string;
  workflow_id?: string | null;
  node_type: string;
  input_data: any;
  output_data: any;
  processing_metadata: any;
  status: 'success' | 'error' | 'warning' | 'info';
  execution_time_ms: number;
  created_at: string;
}

const StepLogPanel: React.FC<StepLogPanelProps> = ({ nodeId, executionId, workflowId, onClose }) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [stepLog, setStepLog] = useState<StepLog | null>(null);
  const [allLogs, setAllLogs] = useState<StepLog[]>([]);
  const [currentLogIndex, setCurrentLogIndex] = useState<number>(0);

  useEffect(() => {
    if (!nodeId || !executionId) {
      setLoading(false);
      return;
    }

    const fetchStepLog = async () => {
      setLoading(true);
      try {
        const { data: logsExistResult, error: rpcError } = await supabase
          .rpc<NodeLogsCheckResult>('check_node_logs', { node_id_param: nodeId })
          .single();
          
        if (logsExistResult && logsExistResult.has_logs) {
          const { data: executionLogsRaw, error: executionError } = await supabase
            .from('workflow_step_logs' as any)
            .select('*')
            .eq('execution_id', executionId)
            .then(response => ({
              data: response.data as unknown as StepLog[],
              error: response.error
            }));
            
          if (executionError) {
            throw executionError;
          }
          
          if (executionLogsRaw && executionLogsRaw.length > 0) {
            setAllLogs(executionLogsRaw);
            
            const currentLog = executionLogsRaw.find(log => log.node_id === nodeId) || null;
            setStepLog(currentLog);
            
            if (currentLog) {
              const index = executionLogsRaw.findIndex(log => log.id === currentLog.id);
              setCurrentLogIndex(index >= 0 ? index : 0);
            }
          }
        } else {
          const { data: nodeLogsRaw, error: nodeLogError } = await supabase
            .from('workflow_step_logs' as any)
            .select('*')
            .eq('node_id', nodeId)
            .eq('execution_id', executionId)
            .then(response => ({
              data: response.data as unknown as StepLog[],
              error: response.error
            }));
            
          if (!nodeLogError && nodeLogsRaw && nodeLogsRaw.length > 0) {
            const { data: allExecutionLogsRaw, error: allLogsError } = await supabase
              .from('workflow_step_logs' as any)
              .select('*')
              .eq('execution_id', executionId)
              .then(response => ({
                data: response.data as unknown as StepLog[],
                error: response.error
              }));
              
            if (allExecutionLogsRaw) {
              setAllLogs(allExecutionLogsRaw);
            }
            
            setStepLog(nodeLogsRaw[0]);
            
            if (nodeLogsRaw[0] && allExecutionLogsRaw) {
              const index = allExecutionLogsRaw.findIndex(log => log.id === nodeLogsRaw[0].id);
              setCurrentLogIndex(index >= 0 ? index : 0);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching step log:', error);
        toast.error('Failed to load step execution log');
      } finally {
        setLoading(false);
      }
    };

    fetchStepLog();
  }, [nodeId, executionId]);

  const navigateLog = (direction: 'prev' | 'next') => {
    if (allLogs.length <= 1) return;
    
    let newIndex = direction === 'prev' 
      ? Math.max(0, currentLogIndex - 1)
      : Math.min(allLogs.length - 1, currentLogIndex + 1);
    
    if (newIndex !== currentLogIndex) {
      setCurrentLogIndex(newIndex);
      setStepLog(allLogs[newIndex]);
    }
  };

  const formatJsonData = (data: any) => {
    if (!data) return 'No data available';
    
    try {
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  };

  const renderData = (data: any, type: 'input' | 'output') => {
    if (loading) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      );
    }

    if (!data) {
      return <div className="text-muted-foreground italic">No data available</div>;
    }

    const isSpreadsheetData = 
      stepLog?.node_type === 'spreadsheetGenerator' || 
      (data.sheets || data.rows || data.columns || data.headers);

    if (isSpreadsheetData) {
      return renderSpreadsheetData(data, type);
    }

    return (
      <ScrollArea className="h-[300px] rounded-md border p-4">
        <pre className="text-xs text-left font-mono whitespace-pre-wrap break-words">
          {formatJsonData(data)}
        </pre>
      </ScrollArea>
    );
  };

  const renderSpreadsheetData = (data: any, type: 'input' | 'output') => {
    let headers: string[] = [];
    let rows: any[] = [];

    if (data.headers) {
      headers = data.headers;
    } else if (data.columns) {
      headers = Array.isArray(data.columns) ? data.columns.map((col: any) => col.header || col.name || col) : [];
    }

    if (data.rows) {
      rows = data.rows;
    } else if (data.data) {
      rows = data.data;
    }

    if (headers.length === 0 && rows.length > 0) {
      if (typeof rows[0] === 'object') {
        headers = Object.keys(rows[0]);
      }
    }

    if (headers.length === 0) {
      return (
        <ScrollArea className="h-[300px] rounded-md border p-4">
          <pre className="text-xs text-left font-mono whitespace-pre-wrap break-words">
            {formatJsonData(data)}
          </pre>
        </ScrollArea>
      );
    }

    return (
      <ScrollArea className="h-[300px]">
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                {headers.map((header, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {headers.map((header, j) => (
                    <td key={j} className="px-3 py-2 text-xs">
                      {typeof row === 'object' ? String(row[header] || '') : String(row || '')}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length > 50 && (
                <tr>
                  <td colSpan={headers.length} className="px-3 py-2 text-xs text-center italic text-muted-foreground">
                    Showing first 50 rows of {rows.length} total
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    );
  };

  const renderComparison = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Input</h3>
            <Skeleton className="h-[300px]" />
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Output</h3>
            <Skeleton className="h-[300px]" />
          </div>
        </div>
      );
    }

    if (!stepLog) {
      return <div className="text-muted-foreground italic">No log data available for this step</div>;
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Input</h3>
          {renderData(stepLog.input_data, 'input')}
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Output</h3>
          {renderData(stepLog.output_data, 'output')}
        </div>
      </div>
    );
  };

  if (!nodeId) {
    return null;
  }

  return (
    <div 
      className={`fixed right-0 top-0 h-screen bg-white border-l shadow-md z-10 transition-all duration-300 ${
        expanded ? 'w-[80vw]' : 'w-[40vw]'
      }`}
    >
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Step Execution Log</h2>
          {stepLog && (
            <Badge 
              variant={
                stepLog.status === 'error' ? 'destructive' : 
                stepLog.status === 'warning' ? 'outline' : 
                stepLog.status === 'info' ? 'secondary' : 
                'default'
              }
            >
              {stepLog.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse panel" : "Expand panel"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {allLogs.length > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigateLog('prev')} 
            disabled={currentLogIndex === 0}
            className="text-xs flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Previous Step
          </Button>
          <span className="text-xs text-muted-foreground">
            Step {currentLogIndex + 1} of {allLogs.length}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigateLog('next')} 
            disabled={currentLogIndex === allLogs.length - 1}
            className="text-xs flex items-center gap-1"
          >
            Next Step <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="p-4">
        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-1">
              <ArrowRight className="h-4 w-4" /> Input/Output
            </TabsTrigger>
            <TabsTrigger value="input" className="flex items-center gap-1">
              <Database className="h-4 w-4" /> Input
            </TabsTrigger>
            <TabsTrigger value="output" className="flex items-center gap-1">
              <Database className="h-4 w-4" /> Output
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1">
              <Terminal className="h-4 w-4" /> Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : !stepLog ? (
              <div className="text-muted-foreground italic">No log data available for this step</div>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Step Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Node Type:</dt>
                      <dd className="font-medium">{stepLog.node_type}</dd>
                      
                      <dt className="text-muted-foreground">Execution Time:</dt>
                      <dd className="font-medium">{stepLog.execution_time_ms}ms</dd>
                      
                      <dt className="text-muted-foreground">Status:</dt>
                      <dd>
                        <Badge variant={stepLog.status === 'error' ? 'destructive' : 'default'}>
                          {stepLog.status}
                        </Badge>
                      </dd>
                      
                      <dt className="text-muted-foreground">Executed At:</dt>
                      <dd className="font-medium">
                        {new Date(stepLog.created_at).toLocaleString()}
                      </dd>
                    </dl>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Input Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-[150px] overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                        {typeof stepLog.input_data === 'object' 
                          ? JSON.stringify(stepLog.input_data, null, 2).substring(0, 500) 
                          : String(stepLog.input_data).substring(0, 500)}
                        {(typeof stepLog.input_data === 'object' 
                          ? JSON.stringify(stepLog.input_data, null, 2).length > 500 
                          : String(stepLog.input_data).length > 500) 
                          && '...'}
                      </pre>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Output Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-[150px] overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                        {typeof stepLog.output_data === 'object' 
                          ? JSON.stringify(stepLog.output_data, null, 2).substring(0, 500) 
                          : String(stepLog.output_data).substring(0, 500)}
                        {(typeof stepLog.output_data === 'object' 
                          ? JSON.stringify(stepLog.output_data, null, 2).length > 500 
                          : String(stepLog.output_data).length > 500) 
                          && '...'}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comparison">
            {renderComparison()}
          </TabsContent>

          <TabsContent value="input">
            <h3 className="text-sm font-medium mb-2">Input Data</h3>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : !stepLog ? (
              <div className="text-muted-foreground italic">No input data available</div>
            ) : (
              renderData(stepLog.input_data, 'input')
            )}
          </TabsContent>

          <TabsContent value="output">
            <h3 className="text-sm font-medium mb-2">Output Data</h3>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : !stepLog ? (
              <div className="text-muted-foreground italic">No output data available</div>
            ) : (
              renderData(stepLog.output_data, 'output')
            )}
          </TabsContent>

          <TabsContent value="details">
            <h3 className="text-sm font-medium mb-2">Processing Details</h3>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : !stepLog ? (
              <div className="text-muted-foreground italic">No details available</div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Node ID:</dt>
                    <dd className="font-mono text-xs overflow-auto">{stepLog.node_id}</dd>
                    
                    <dt className="text-muted-foreground">Execution ID:</dt>
                    <dd className="font-mono text-xs overflow-auto">{stepLog.execution_id}</dd>
                    
                    <dt className="text-muted-foreground">Log ID:</dt>
                    <dd className="font-mono text-xs overflow-auto">{stepLog.id}</dd>
                  </dl>
                  
                  <Separator className="my-4" />
                  
                  <h4 className="text-sm font-medium mb-2">Processing Metadata</h4>
                  {stepLog.processing_metadata ? (
                    <ScrollArea className="h-[200px] rounded-md border p-4">
                      <pre className="text-xs text-left font-mono whitespace-pre-wrap break-words">
                        {formatJsonData(stepLog.processing_metadata)}
                      </pre>
                    </ScrollArea>
                  ) : (
                    <div className="text-muted-foreground italic">No processing metadata available</div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StepLogPanel;
