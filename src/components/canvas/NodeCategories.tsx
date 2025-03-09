
import { ReactNode } from 'react';

export interface NodeCategoryItem {
  type: string;
  label: string;
  description: string;
}

export interface NodeCategory {
  id: string;
  name: string;
  items: NodeCategoryItem[];
}

export const nodeCategories: NodeCategory[] = [
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
