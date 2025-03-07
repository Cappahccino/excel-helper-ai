
import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
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
  Node,
  Edge as ReactFlowEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AINode from '@/components/workflow/nodes/AINode';
import AskAINode from '@/components/workflow/nodes/AskAINode';
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';
import UtilityNode from '@/components/workflow/nodes/UtilityNode';
import FileUploadNode from '@/components/workflow/nodes/FileUploadNode';
import StepLogPanel from '@/components/workflow/StepLogPanel';

import NodeLibrary from '@/components/workflow/NodeLibrary';
import { useWorkflowRealtime } from '@/hooks/useWorkflowRealtime';
import { 
  WorkflowNode, 
  NodeType, 
  WorkflowDefinition,
  NodeComponentType,
  WorkflowNodeData,
  Edge,
  InputNodeType,
  ProcessingNodeType,
  AINodeType,
  OutputNodeType,
  IntegrationNodeType,
  ControlNodeType,
  UtilityNodeType
} from '@/types/workflow';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Play, Plus, FileText } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  askAI: AskAINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
  utilityNode: UtilityNode,
  fileUpload: FileUploadNode,
};

const nodeCategories = [
  {
    id: 'input',
    name: 'Data Input',
    items: [
      { type: 'dataInput', label: 'Data Input', description: 'Import data from external sources' },
      { type: 'fileUpload', label: 'File Upload', description: 'Accepts Excel, CSV, JSON, or other structured files' },
      { type: 'databaseQuery', label: 'Database Query', description: 'Fetches data from SQL/NoSQL databases' },
      { type: 'manualEntry', label: 'Manual Data Entry', description: 'Allows users to input values manually' },
      { type: 'apiFetch', label: 'API Fetch', description: 'Retrieves data from external APIs' },
      { type: 'webhookListener', label: 'Webhook Listener', description: 'Triggers a workflow when an external service sends data' },
      { type: 'ftpImport', label: 'FTP/SFTP Import', description: 'Pulls data from remote file servers' },
      { type: 'emailAttachment', label: 'Email Attachment', description: 'Extracts data from email attachments' },
      { type: 'formSubmission', label: 'Form Submission', description: 'Captures user form inputs' },
      { type: 'scheduledFetch', label: 'Scheduled Fetch', description: 'Runs periodic data retrieval' },
      { type: 'spreadsheetImport', label: 'Spreadsheet Import', description: 'Loads data from Google Sheets/Excel' },
      { type: 'crmDataPull', label: 'CRM Data Pull', description: 'Retrieves leads, deals, or contacts from a CRM' },
      { type: 'erpDataFetch', label: 'ERP Data Fetch', description: 'Imports financial or inventory data from ERP systems' },
      { type: 'spreadsheetGenerator', label: 'Spreadsheet Generator', description: 'Generate Excel or CSV files' }
    ]
  },
  {
    id: 'processing',
    name: 'Data Processing',
    items: [
      { type: 'filtering', label: 'Filtering', description: 'Filter data based on specified conditions' },
      { type: 'sorting', label: 'Sorting', description: 'Orders data based on specified criteria' },
      { type: 'aggregation', label: 'Aggregation', description: 'Computes sums, averages, counts, etc.' },
      { type: 'formulaCalculation', label: 'Formula Calculation', description: 'Applies Excel-like formulas to data' },
      { type: 'textTransformation', label: 'Text Transformation', description: 'Applies string operations' },
      { type: 'dataTypeConversion', label: 'Data Type Conversion', description: 'Converts text to numbers, dates, etc.' },
      { type: 'dateFormatting', label: 'Date Formatting', description: 'Converts timestamps or applies date formats' },
      { type: 'joinMerge', label: 'Join/Merge Datasets', description: 'Combines data from multiple sources' },
      { type: 'pivotTable', label: 'Pivot Table Creation', description: 'Restructures tabular data' },
      { type: 'deduplication', label: 'Deduplication', description: 'Removes duplicate entries' },
    ]
  },
  {
    id: 'ai',
    name: 'AI & Analysis',
    items: [
      { type: 'aiNode', label: 'AI Node', description: 'Apply AI and ML algorithms to data' },
      { type: 'askAI', label: 'Ask AI', description: 'Ask questions to AI models like OpenAI, Claude, or Deepseek' },
      { type: 'aiSummarization', label: 'AI Summarization', description: 'Uses OpenAI to summarize text or numerical data' },
      { type: 'sentimentAnalysis', label: 'Sentiment Analysis', description: 'Classifies text as positive, negative, or neutral' },
      { type: 'namedEntityRecognition', label: 'Named Entity Recognition', description: 'Extracts names, dates, locations from text' },
      { type: 'anomalyDetection', label: 'Anomaly Detection', description: 'Identifies outliers in datasets' },
      { type: 'forecasting', label: 'Forecasting & Predictions', description: 'Uses ML models to predict trends' },
      { type: 'documentParsing', label: 'Document Parsing (OCR)', description: 'Converts PDFs or images to structured text' },
      { type: 'clustering', label: 'Clustering & Segmentation', description: 'Groups similar data points' },
      { type: 'mlModelExecution', label: 'Machine Learning Model Execution', description: 'Runs a custom ML model' },
      { type: 'featureEngineering', label: 'Feature Engineering', description: 'Transforms raw data for ML analysis' },
      { type: 'aiDataCleaning', label: 'AI-powered Data Cleaning', description: 'Automatically corrects inconsistencies' }
    ]
  },
  {
    id: 'output',
    name: 'Output',
    items: [
      { type: 'outputNode', label: 'Output Node', description: 'Export or visualize processed data' },
      { type: 'downloadFile', label: 'Download File', description: 'Provides a processed file for download' },
      { type: 'sendEmail', label: 'Send Email', description: 'Sends processed data via email' },
      { type: 'exportToDatabase', label: 'Export to Database', description: 'Saves structured data into databases' },
      { type: 'webhookTrigger', label: 'Webhook Trigger', description: 'Sends processed data to an external API' },
      { type: 'pushNotification', label: 'Push Notification', description: 'Sends alerts to users' },
      { type: 'excelExport', label: 'Excel File Export', description: 'Creates an Excel report with structured data' },
      { type: 'pdfGeneration', label: 'PDF Report Generation', description: 'Converts processed data into a formatted PDF' },
      { type: 'googleSheetsUpdate', label: 'Google Sheets Update', description: 'Writes output data to Google Sheets' },
      { type: 'ftpUpload', label: 'FTP/SFTP Upload', description: 'Sends processed files to a remote server' },
      { type: 'crmUpdate', label: 'CRM Update', description: 'Updates contacts, deals, or notes in a CRM system' },
      { type: 'erpDataSync', label: 'ERP Data Sync', description: 'Sends processed financial data back to ERP' },
      { type: 'slackNotification', label: 'Slack/Teams Notification', description: 'Posts messages to collaboration tools' },
      { type: 'webhookResponse', label: 'Webhook Response', description: 'Sends back data to a requester' },
      { type: 'apiResponse', label: 'API Response', description: 'Returns structured data via an API' },
      { type: 'smsAlert', label: 'SMS Alert', description: 'Sends text message notifications' }
    ]
  },
  {
    id: 'integration',
    name: 'Integrations',
    items: [
      { type: 'integrationNode', label: 'Integration Node', description: 'Connect with external services' },
      { type: 'salesforceConnector', label: 'Salesforce Connector', description: 'Fetch or update CRM data' },
      { type: 'xeroConnector', label: 'Xero Connector', description: 'Pull accounting data or push invoices' },
      { type: 'hubspotConnector', label: 'HubSpot Connector', description: 'Integrate with marketing/sales data' },
      { type: 'googleSheetsConnector', label: 'Google Sheets Connector', description: 'Sync data with Google Sheets' },
      { type: 'stripeConnector', label: 'Stripe Connector', description: 'Fetch payment transactions' },
      { type: 'quickbooksConnector', label: 'QuickBooks Connector', description: 'Access financial data' },
      { type: 'zendeskConnector', label: 'Zendesk Connector', description: 'Fetch support ticket data' },
      { type: 'shopifyConnector', label: 'Shopify Connector', description: 'Retrieve e-commerce order data' },
      { type: 's3Connector', label: 'AWS S3 Connector', description: 'Read/write files in cloud storage' },
      { type: 'zapierConnector', label: 'Zapier Connector', description: 'Connect to thousands of third-party apps' },
      { type: 'googleDriveConnector', label: 'Google Drive API', description: 'Read/write files in Google Drive' },
      { type: 'customApiConnector', label: 'Custom API Connector', description: 'Generic node to fetch from any API' },
      { type: 'erpConnector', label: 'ERP System Connector', description: 'Fetch or push enterprise data' },
      { type: 'twilioConnector', label: 'Twilio Connector', description: 'Send SMS or make calls' },
      { type: 'powerBiConnector', label: 'Power BI Connector', description: 'Send processed data for visualization' }
    ]
  },
  {
    id: 'control',
    name: 'Control Flow',
    items: [
      { type: 'controlNode', label: 'Control Node', description: 'Control the workflow execution path' },
      { type: 'ifElseCondition', label: 'If-Else Condition', description: 'Executes different branches based on logic' },
      { type: 'loopForEach', label: 'Loop / For Each', description: 'Iterates over data items' },
      { type: 'parallelProcessing', label: 'Parallel Processing', description: 'Runs multiple steps simultaneously' },
      { type: 'errorHandling', label: 'Error Handling', description: 'Catches and handles errors in execution' },
      { type: 'waitPause', label: 'Wait/Pause Step', description: 'Introduces a delay before proceeding' },
      { type: 'webhookWait', label: 'Webhook Wait', description: 'Pauses execution until an external event occurs' },
      { type: 'retryMechanism', label: 'Retry Mechanism', description: 'Retries failed steps' },
      { type: 'switchCase', label: 'Switch Case', description: 'Routes execution based on predefined conditions' }
    ]
  },
  {
    id: 'utility',
    name: 'Utility',
    items: [
      { type: 'logToConsole', label: 'Log to Console', description: 'Outputs debug information' },
      { type: 'executionTimestamp', label: 'Execution Timestamp', description: 'Captures execution time' },
      { type: 'sessionManagement', label: 'Session Management', description: 'Tracks user interactions over time' },
      { type: 'variableStorage', label: 'Variable Storage', description: 'Stores temporary values for later steps' },
      { type: 'aiStepRecommendation', label: 'AI-based Step Recommendation', description: 'Suggests next workflow steps' },
      { type: 'workflowVersionControl', label: 'Workflow Version Control', description: 'Saves different versions of a workflow' },
      { type: 'performanceMetrics', label: 'Performance Metrics Collection', description: 'Measures step execution times' }
    ]
  }
];

const Canvas = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [workflowName, setWorkflowName] = useState<string>('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);
  const [savingWorkflowId, setSavingWorkflowId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showLogPanel, setShowLogPanel] = useState<boolean>(false);
  
  const { status: executionStatus, subscriptionStatus } = useWorkflowRealtime({
    executionId,
    workflowId: savingWorkflowId,
    onStatusChange: (status) => {
      console.log(`Workflow status changed to: ${status}`);
    }
  });

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      loadWorkflow();
    }
  }, [workflowId]);

  // Updated onNodeClick handler to prevent default behavior and stop propagation
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Prevent default behavior to avoid navigation
    event.preventDefault();
    // Stop event propagation
    event.stopPropagation();
    
    setSelectedNodeId(node.id);
    setShowLogPanel(true);
  }, []);

  const loadWorkflow = async () => {
    if (!workflowId || workflowId === 'new') return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setWorkflowName(data.name || 'New Workflow');
        setWorkflowDescription(data.description || '');
        setSavingWorkflowId(data.id);
        
        const definition = typeof data.definition === 'string' 
          ? JSON.parse(data.definition) 
          : data.definition;
        
        if (definition.nodes) {
          setNodes(definition.nodes as WorkflowNode[]);
        }
        
        if (definition.edges) {
          setEdges(definition.edges);
        }

        if (data.last_run_at) {
          const lastRunDate = new Date(data.last_run_at);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastRunDate.getTime()) / (1000 * 60);
          
          if (diffMinutes < 60) {
            const lastStatus = data.last_run_status != null ? String(data.last_run_status) : 'unknown';
            console.log(`Retrieved workflow with status: ${lastStatus}`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const ensureUniqueWorkflowName = async (baseName: string): Promise<string> => {
    if (savingWorkflowId) {
      return baseName;
    }

    let newName = baseName;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const { data, error } = await supabase
        .from('workflows')
        .select('id')
        .eq('name', newName)
        .limit(1);
      
      if (error) {
        console.error('Error checking workflow name:', error);
        return newName;
      }
      
      if (data && data.length === 0) {
        isUnique = true;
      } else {
        newName = `${baseName}${counter}`;
        counter++;
      }
    }
    
    return newName;
  };

  const saveWorkflow = async () => {
    try {
      setIsSaving(true);
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      if (!userId) {
        toast.error('User not authenticated');
        return null;
      }
      
      const uniqueName = await ensureUniqueWorkflowName(workflowName || 'New Workflow');
      if (uniqueName !== workflowName) {
        setWorkflowName(uniqueName);
        toast.info(`Name updated to "${uniqueName}" to ensure uniqueness`);
      }
      
      const workflow = {
        name: uniqueName,
        description: workflowDescription,
        definition: JSON.stringify({
          nodes,
          edges,
        }),
        user_id: userId,
        created_by: userId,
      };
      
      let response;
      let savedWorkflowId;
      
      if (savingWorkflowId) {
        response = await supabase
          .from('workflows')
          .update(workflow)
          .eq('id', savingWorkflowId)
          .select('id');
        
        savedWorkflowId = savingWorkflowId;
      } else {
        response = await supabase
          .from('workflows')
          .insert(workflow)
          .select('id');
        
        if (response.data && response.data[0]) {
          savedWorkflowId = response.data[0].id;
          setSavingWorkflowId(savedWorkflowId);
          
          if (workflowId === 'new') {
            navigate(`/canvas/${savedWorkflowId}`, { replace: true });
          }
        }
      }
      
      if (response.error) throw response.error;
      
      toast.success('Workflow saved successfully');
      return savedWorkflowId;
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflow = async () => {
    setIsRunning(true);
    
    try {
      const workflowIdToRun = savingWorkflowId || await saveWorkflow();
      
      if (!workflowIdToRun) {
        toast.error('Please save the workflow before running it');
        setIsRunning(false);
        return;
      }

      const { data, error } = await supabase
        .rpc('start_workflow_execution', { workflow_id: workflowIdToRun });

      if (error) throw error;
      
      toast.success('Workflow execution started');
      
      if (data && typeof data === 'object' && 'execution_id' in data) {
        const newExecutionId = data.execution_id as string;
        setExecutionId(newExecutionId);
        console.log('Execution ID:', newExecutionId);
      }
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Failed to run workflow');
    } finally {
      setIsRunning(false);
    }
  };

  const handleNodeConfigUpdate = (nodeId: string, config: any) => {
    setNodes((prevNodes) => {
      return prevNodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                ...config
              },
              workflowId: savingWorkflowId
            }
          };
        }
        return node;
      });
    });

    if (window.saveWorkflowTimeout) {
      clearTimeout(window.saveWorkflowTimeout);
    }
    
    window.saveWorkflowTimeout = setTimeout(() => saveWorkflow(), 1000) as unknown as number;
  };

  const handleAddNode = (nodeType: string, nodeCategory: string, nodeLabel: string) => {
    const nodeId = `node-${uuidv4()}`;
    
    const nodeComponentType: NodeComponentType = (() => {
      switch (nodeCategory) {
        case 'input': 
          if (nodeType === 'fileUpload') {
            return 'fileUpload';
          }
          if (nodeType === 'spreadsheetGenerator') {
            return 'spreadsheetGenerator';
          }
          return 'dataInput';
        case 'processing': return 'dataProcessing';
        case 'ai': 
          if (nodeType === 'askAI') {
            return 'askAI';
          }
          return 'aiNode';
        case 'output': return 'outputNode';
        case 'integration': return 'integrationNode';
        case 'control': return 'controlNode';
        case 'utility': return 'utilityNode';
        default: return 'dataInput';
      }
    })();

    const createNodeData = (): WorkflowNodeData => {
      const baseData = {
        label: nodeLabel || 'New Node',
        config: {}
      };

      switch (nodeComponentType) {
        case 'fileUpload':
          return {
            ...baseData,
            type: 'fileUpload' as const,
            config: {}
          };
        case 'spreadsheetGenerator':
          return {
            ...baseData,
            type: 'spreadsheetGenerator' as const,
            config: {
              filename: 'generated',
              fileExtension: 'xlsx',
              sheets: [{ name: 'Sheet1', columns: [] }]
            }
          };
        case 'dataInput':
          return {
            ...baseData,
            type: nodeType as InputNodeType,
            config: {}
          };
        case 'dataProcessing':
          return {
            ...baseData,
            type: nodeType as ProcessingNodeType,
            config: {
              operation: nodeType,
              ...(nodeType === 'filtering' && {
                column: '',
                operator: 'equals',
                value: ''
              }),
              ...(nodeType === 'sorting' && {
                column: '',
                order: 'ascending'
              }),
              ...(nodeType === 'aggregation' && {
                function: 'sum',
                column: '',
                groupBy: ''
              }),
              ...(nodeType === 'formulaCalculation' && {
                description: '',
                applyTo: []
              }),
              ...(nodeType === 'textTransformation' && {
                column: '',
                transformation: 'uppercase'
              }),
              ...(nodeType === 'dataTypeConversion' && {
                column: '',
                fromType: 'text',
                toType: 'number'
              }),
              ...(nodeType === 'dateFormatting' && {
                column: '',
                format: 'MM/DD/YYYY'
              }),
              ...(nodeType === 'pivotTable' && {
                rows: [],
                columns: [],
                values: []
              }),
              ...(nodeType === 'joinMerge' && {
                leftKey: '',
                rightKey: '',
                joinType: 'inner'
              }),
              ...(nodeType === 'deduplication' && {
                columns: [],
                caseSensitive: true
              })
            }
          };
        case 'aiNode':
          return {
            ...baseData,
            type: nodeType as AINodeType,
            config: {}
          };
        case 'askAI':
          return {
            ...baseData,
            type: 'askAI' as AINodeType,
            config: {
              aiProvider: 'openai', 
              modelName: 'gpt-4o-mini',
              prompt: ''
            }
          };
        case 'outputNode':
          return {
            ...baseData,
            type: nodeType as OutputNodeType,
            config: {}
          };
        case 'integrationNode':
          return {
            ...baseData,
            type: nodeType as IntegrationNodeType,
            config: {}
          };
        case 'controlNode':
          return {
            ...baseData,
            type: nodeType as ControlNodeType,
            config: {}
          };
        case 'utilityNode':
          return {
            ...baseData,
            type: nodeType as UtilityNodeType,
            config: {}
          };
        default:
          return {
            ...baseData,
            type: 'dataInput' as InputNodeType,
            config: {}
          };
      }
    };

    const newNode: WorkflowNode = {
      id: nodeId,
      type: nodeComponentType,
      position: { x: 100, y: 100 },
      data: createNodeData()
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);
    toast.success(`Added ${nodeLabel} node to canvas`);
  };

  const getNodeTypes = () => ({
    dataInput: DataInputNode,
    dataProcessing: (props: any) => <DataProcessingNode {...props} onConfigChange={handleNodeConfigUpdate} />,
    aiNode: AINode,
    askAI: (props: any) => <AskAINode {...props} onConfigChange={handleNodeConfigUpdate} />,
    outputNode: OutputNode,
    integrationNode: IntegrationNode,
    controlNode: ControlNode,
    spreadsheetGenerator: (props: any) => <SpreadsheetGeneratorNode {...props} onConfigChange={handleNodeConfigUpdate} />,
    utilityNode: UtilityNode,
    fileUpload: (props: any) => <FileUploadNode 
      {...{
        ...props,
        data: {
          ...props.data,
          workflowId: savingWorkflowId,
          onChange: handleNodeConfigUpdate
        }
      }} 
    />,
  });

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-4 flex justify-between items-center">
        <div className="flex-1 mr-4">
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-xl font-bold mb-2"
            placeholder="Workflow Name"
          />
          <Textarea
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            className="text-sm resize-none"
            placeholder="Describe your workflow..."
            rows={2}
          />
        </div>
        <div className="flex space-x-2 items-center">
          {executionStatus && (
            <div className={`px-3 py-1 text-sm rounded-full flex items-center ${
              executionStatus === 'completed' ? 'bg-green-100 text-green-800' :
              executionStatus === 'failed' ? 'bg-red-100 text-red-800' :
              executionStatus === 'running' ? 'bg-blue-100 text-blue-800' :
              executionStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {subscriptionStatus === 'subscribing' && (
                <span className="mr-2 h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              )}
              {executionStatus === 'completed' ? 'Completed' :
               executionStatus === 'failed' ? 'Failed' :
               executionStatus === 'pending' ? 'Pending' :
               executionStatus === 'running' ? 'Running...' :
               executionStatus}
            </div>
          )}
          
          <Button 
            onClick={saveWorkflow} 
            disabled={isSaving}
            className="flex items-center"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button 
            onClick={runWorkflow} 
            variant="outline"
            disabled={isRunning || executionStatus === 'running'}
            className="flex items-center"
          >
            <Play className="mr-2 h-4 w-4" />
            {isRunning ? 'Starting...' : executionStatus === 'running' ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex">
        <Tabs defaultValue="canvas" className="w-full">
          <TabsList className="px-4 pt-2">
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="canvas" className="flex-1 h-full">
            <div className="h-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={getNodeTypes()}
                fitView
                attributionPosition="top-right"
                style={{ backgroundColor: "#F7F9FB" }}
              >
                <Controls />
                <MiniMap nodeClassName={node => node.type} />
                <Background />
                <Panel position="top-right">
                  <Button 
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      setIsAddingNode(true);
                    }} 
                    className="flex items-center"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Node
                  </Button>
                  {executionId && (
                    <Button
                      variant="outline"
                      onClick={() => setShowLogPanel(!showLogPanel)}
                      className="ml-2 flex items-center"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {showLogPanel ? 'Hide Logs' : 'Show Logs'}
                    </Button>
                  )}
                </Panel>
              </ReactFlow>
            </div>

            {showLogPanel && (
              <StepLogPanel
                nodeId={selectedNodeId}
                executionId={executionId}
                workflowId={savingWorkflowId}
                onClose={() => setShowLogPanel(false)}
              />
            )}
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Settings</CardTitle>
              </CardHeader>
              <CardContent>
                {executionStatus && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">Execution Status</h3>
                    <div className={`px-3 py-2 rounded ${
                      executionStatus === 'completed' ? 'bg-green-100 text-green-800' :
                      executionStatus === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {executionStatus === 'completed' ? 'Workflow completed successfully' :
                       executionStatus === 'failed' ? 'Workflow execution failed' :
                       executionStatus === 'pending' ? 'Workflow is queued and waiting to be processed' :
                       executionStatus === 'running' ? 'Workflow is currently running...' :
                       `Workflow status: ${executionStatus}`}
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2">Workflow ID</h3>
                  <div className="text-sm bg-gray-100 p-2 rounded">
                    {savingWorkflowId || 'Not saved yet'}
                  </div>
                </div>
                
                {executionId && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">Current Execution ID</h3>
                    <div className="text-sm bg-gray-100 p-2 rounded">
                      {executionId}
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2">Node Count</h3>
                  <div className="text-sm">{nodes.length} nodes in this workflow</div>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold mb-2">Edge Count</h3>
                  <div className="text-sm">{edges.length} connections between nodes</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <NodeLibrary
        isOpen={isAddingNode}
        onClose={() => setIsAddingNode(false)}
        onAddNode={(nodeType, nodeCategory, nodeLabel) => {
          handleAddNode(nodeType, nodeCategory, nodeLabel);
        }}
        nodeCategories={nodeCategories}
      />
    </div>
  );
};

declare global {
  interface Window {
    saveWorkflowTimeout?: number;
  }
}

export default Canvas;
