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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AINode from '@/components/workflow/nodes/AINode';
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';
import UtilityNode from '@/components/workflow/nodes/UtilityNode';

import NodeLibrary from '@/components/workflow/NodeLibrary';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Play, Plus } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
  utilityNode: UtilityNode,
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
      { type: 'dataProcessing', label: 'Data Processing', description: 'Transform and process data' },
      { type: 'columnMapping', label: 'Column Mapping', description: 'Renames or reorders columns in datasets' },
      { type: 'filtering', label: 'Filtering', description: 'Excludes data based on conditions' },
      { type: 'sorting', label: 'Sorting', description: 'Orders data based on specified criteria' },
      { type: 'aggregation', label: 'Aggregation', description: 'Computes sums, averages, min/max, etc' },
      { type: 'formulaCalculation', label: 'Formula Calculation', description: 'Applies Excel-like formulas to data' },
      { type: 'currencyConversion', label: 'Currency Conversion', description: 'Converts financial values using live FX rates' },
      { type: 'textTransformation', label: 'Text Transformation', description: 'Applies string operations' },
      { type: 'dataTypeConversion', label: 'Data Type Conversion', description: 'Converts text to numbers, dates, etc' },
      { type: 'deduplication', label: 'Deduplication', description: 'Removes duplicate entries' },
      { type: 'joinMerge', label: 'Join/Merge Datasets', description: 'Combines data from multiple sources' },
      { type: 'pivotTable', label: 'Pivot Table Creation', description: 'Restructures tabular data' },
      { type: 'conditionalLogic', label: 'Conditional Logic', description: 'Performs different actions based on conditions' },
      { type: 'dateFormatting', label: 'Date Formatting', description: 'Converts timestamps or applies offsets' },
      { type: 'dataMasking', label: 'Data Masking', description: 'Redacts or anonymizes sensitive data' },
      { type: 'normalization', label: 'Normalization', description: 'Scales numerical data for analysis' }
    ]
  },
  {
    id: 'ai',
    name: 'AI & Analysis',
    items: [
      { type: 'aiNode', label: 'AI Node', description: 'Apply AI and ML algorithms to data' },
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState<string>('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      loadWorkflow();
    }
  }, [workflowId]);

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
        setWorkflowName(data.name);
        setWorkflowDescription(data.description);
        
        const definition = typeof data.definition === 'string' 
          ? JSON.parse(data.definition) 
          : data.definition;
        
        setNodes(definition.nodes || []);
        setEdges(definition.edges || []);
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const saveWorkflow = async () => {
    try {
      setIsSaving(true);
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
        created_by: userId,
      };
      
      let response;
      
      if (workflowId && workflowId !== 'new') {
        response = await supabase
          .from('workflows')
          .update(workflow)
          .eq('id', workflowId);
      } else {
        response = await supabase
          .from('workflows')
          .insert(workflow);
      }
      
      if (response.error) throw response.error;
      
      toast.success('Workflow saved successfully');
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflow = async () => {
    if (!workflowId || workflowId === 'new') {
      toast.error('Please save the workflow before running it');
      return;
    }

    try {
      const { data, error } = await supabase
        .rpc('start_workflow_execution', { workflow_id: workflowId });

      if (error) throw error;
      
      toast.success('Workflow execution started');
      
      if (data && typeof data === 'object' && 'execution_id' in data) {
        console.log('Execution ID:', data.execution_id);
      }
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Failed to run workflow');
    }
  };

  const handleAddNode = (nodeType: string, nodeCategory: string, nodeLabel: string) => {
    const nodeId = `node-${uuidv4()}`;
    
    const nodeComponentType = (() => {
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
        case 'ai': return 'aiNode';
        case 'output': return 'outputNode';
        case 'integration': return 'integrationNode';
        case 'control': return 'controlNode';
        case 'utility': return 'utilityNode';
        default: return 'dataInput';
      }
    })();

    const newNode = {
      id: nodeId,
      type: nodeComponentType,
      position: { x: 100, y: 100 },
      data: {
        label: nodeLabel || 'New Node',
        type: nodeType,
        config: {}
      }
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);
    toast.success(`Added ${nodeLabel} node to canvas`);
  };

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
        <div className="flex space-x-2">
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
            className="flex items-center"
          >
            <Play className="mr-2 h-4 w-4" />
            Run
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
                nodeTypes={nodeTypes}
                fitView
              >
                <Controls />
                <MiniMap />
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
                </Panel>
              </ReactFlow>
            </div>
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Configure additional workflow settings here.</p>
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

export default Canvas;
