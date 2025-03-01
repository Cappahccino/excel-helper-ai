// src/services/workflow/handlers/apiIntegration.ts

import { NodeDefinition } from '@/types/workflow';
import { supabase } from "@/integrations/supabase/client";

interface ApiIntegrationConfig {
  service: 'xero' | 'salesforce' | 'google_sheets' | 'custom';
  operation: string;
  endpoint?: string; // For custom APIs
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; // For custom APIs
  headers?: Record<string, string>; // For custom APIs
  mapping: {
    request: Record<string, string | { value: string; type: 'field' | 'static' | 'formula' }>;
    response?: Record<string, string>;
  };
  authentication?: {
    type: 'oauth2' | 'api_key' | 'basic' | 'bearer';
    credentialId?: string; // Reference to stored credentials
  };
  pagination?: {
    enabled: boolean;
    type?: 'offset' | 'cursor' | 'page';
    limitParam?: string;
    pageParam?: string;
    cursorParam?: string;
    cursorPath?: string;
    totalPath?: string;
    limit?: number;
  };
  errorHandling?: {
    retries: number;
    backoff: number; // in milliseconds
  };
}

// Service-specific API handlers
const API_SERVICE_HANDLERS: Record<string, (config: any, data: any, context: any) => Promise<any>> = {
  xero: handleXeroApi,
  salesforce: handleSalesforceApi,
  google_sheets: handleGoogleSheetsApi,
  custom: handleCustomApi
};

export async function handleApiIntegration(
  node: NodeDefinition,
  inputs: Record<string, any>,
  context: any
) {
  const config = node.data.config as ApiIntegrationConfig;
  
  // Log start of API integration
  await context.logMessage(`Starting API integration with ${config.service}`, 'info', node.id);
  
  try {
    // Validate that the service is supported
    if (!Object.keys(API_SERVICE_HANDLERS).includes(config.service)) {
      throw new Error(`Unsupported API service: ${config.service}`);
    }
    
    // Get authentication credentials
    const credentials = await getCredentials(config.authentication, context.userId);
    
    // Prepare input data for the API call
    const apiData = prepareApiData(inputs.data || [], config.mapping.request);
    
    // Make the API call using the appropriate handler
    const apiHandler = API_SERVICE_HANDLERS[config.service];
    const response = await apiHandler({
      ...config,
      credentials,
      operation: config.operation
    }, apiData, context);
    
    // Transform the response if needed
    const transformedResponse = transformApiResponse(response, config.mapping.response);
    
    // Log success
    await context.logMessage(`API integration with ${config.service} completed successfully`, 'info', node.id);
    
    return {
      data: transformedResponse,
      rawResponse: response,
      success: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Log error
    await context.logMessage(
      `API integration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error',
      node.id
    );
    
    // Handle retries if configured
    if (config.errorHandling && config.errorHandling.retries > 0) {
      await context.logMessage(
        `Retrying API call (${config.errorHandling.retries} attempts remaining)`,
        'info',
        node.id
      );
      
      // Recursive retry with decremented retry count
      return handleApiIntegration(
        {
          ...node,
          data: {
            ...node.data,
            config: {
              ...config,
              errorHandling: {
                ...config.errorHandling,
                retries: config.errorHandling.retries - 1
              }
            }
          }
        },
        inputs,
        context
      );
    }
    
    throw error;
  }
}

// Helper function to get credentials from the database
async function getCredentials(
  authConfig: ApiIntegrationConfig['authentication'],
  userId: string
) {
  if (!authConfig || !authConfig.credentialId) {
    return null;
  }
  
  // Get credentials from the database
  const { data, error } = await supabase
    .from('api_credentials')
    .select('*')
    .eq('id', authConfig.credentialId)
    .eq('user_id', userId)
    .single();
    
  if (error || !data) {
    throw new Error(`Failed to retrieve API credentials: ${error?.message || 'Credentials not found'}`);
  }
  
  // Decrypt sensitive data if needed (implementation depends on your security approach)
  // This is a simplified example
  const decryptedCredentials = {
    ...data,
    secret: data.secret, // In a real app, decrypt this
    access_token: data.access_token, // In a real app, decrypt this
  };
  
  return decryptedCredentials;
}

// Helper function to prepare data for API call
function prepareApiData(
  inputData: any[] | object,
  mapping: ApiIntegrationConfig['mapping']['request']
) {
  // If input is an array, map each item
  if (Array.isArray(inputData)) {
    return inputData.map(item => mapSingleItem(item, mapping));
  }
  
  // If input is an object, map it directly
  return mapSingleItem(inputData, mapping);
}

// Map a single data item using the provided mapping
function mapSingleItem(
  item: any,
  mapping: ApiIntegrationConfig['mapping']['request']
) {
  const result: Record<string, any> = {};
  
  for (const [targetField, sourceConfig] of Object.entries(mapping)) {
    if (typeof sourceConfig === 'string') {
      // Simple field mapping
      result[targetField] = item[sourceConfig];
    } else {
      // Complex mapping with type
      switch (sourceConfig.type) {
        case 'field':
          result[targetField] = item[sourceConfig.value];
          break;
          
        case 'static':
          result[targetField] = sourceConfig.value;
          break;
          
        case 'formula':
          // Simple formula evaluation (should be replaced with a proper formula evaluator)
          try {
            const formula = sourceConfig.value.replace(/\${([^}]+)}/g, (match, field) => {
              return JSON.stringify(item[field]);
            });
            
            // WARNING: Never use eval in production code
            // This is just an example - use a proper formula parser instead
            result[targetField] = eval(formula);
          } catch (error) {
            result[targetField] = null;
          }
          break;
      }
    }
  }
  
  return result;
}

// Transform API response using mapping
function transformApiResponse(
  response: any,
  mapping?: Record<string, string>
) {
  if (!mapping) {
    return response;
  }
  
  // If response is an array, map each item
  if (Array.isArray(response)) {
    return response.map(item => {
      const result: Record<string, any> = {};
      
      for (const [targetField, sourcePath] of Object.entries(mapping)) {
        result[targetField] = getNestedValue(item, sourcePath);
      }
      
      return result;
    });
  }
  
  // If response is an object, map it directly
  const result: Record<string, any> = {};
  
  for (const [targetField, sourcePath] of Object.entries(mapping)) {
    result[targetField] = getNestedValue(response, sourcePath);
  }
  
  return result;
}

// Helper to get nested values from an object using dot notation
function getNestedValue(obj: any, path: string) {
  return path.split('.').reduce((acc, part) => {
    return acc && acc[part] !== undefined ? acc[part] : null;
  }, obj);
}

// Implementation of service-specific handlers
async function handleXeroApi(config: any, data: any, context: any) {
  const { operation, credentials } = config;
  
  await context.logMessage(`Executing Xero operation: ${operation}`, 'info', context.nodeId);
  
  // In a real implementation, you would use the Xero SDK
  // For this example, we're simulating the API call
  switch (operation) {
    case 'create_invoice':
      return simulateXeroCreateInvoice(data, credentials);
      
    case 'get_invoices':
      return simulateXeroGetInvoices(data, credentials);
      
    case 'create_contact':
      return simulateXeroCreateContact(data, credentials);
      
    default:
      throw new Error(`Unsupported Xero operation: ${operation}`);
  }
}

async function handleSalesforceApi(config: any, data: any, context: any) {
  const { operation, credentials } = config;
  
  await context.logMessage(`Executing Salesforce operation: ${operation}`, 'info', context.nodeId);
  
  // In a real implementation, you would use the Salesforce SDK or API
  // For this example, we're simulating the API call
  switch (operation) {
    case 'create_lead':
      return simulateSalesforceCreateLead(data, credentials);
      
    case 'get_opportunities':
      return simulateSalesforceGetOpportunities(data, credentials);
      
    case 'update_account':
      return simulateSalesforceUpdateAccount(data, credentials);
      
    default:
      throw new Error(`Unsupported Salesforce operation: ${operation}`);
  }
}

async function handleGoogleSheetsApi(config: any, data: any, context: any) {
  const { operation, credentials } = config;
  
  await context.logMessage(`Executing Google Sheets operation: ${operation}`, 'info', context.nodeId);
  
  // In a real implementation, you would use the Google Sheets API
  // For this example, we're simulating the API call
  switch (operation) {
    case 'append_values':
      return simulateGoogleSheetsAppendValues(data, credentials, config);
      
    case 'get_values':
      return simulateGoogleSheetsGetValues(data, credentials, config);
      
    case 'update_values':
      return simulateGoogleSheetsUpdateValues(data, credentials, config);
      
    default:
      throw new Error(`Unsupported Google Sheets operation: ${operation}`);
  }
}

async function handleCustomApi(config: any, data: any, context: any) {
  const { endpoint, method = 'GET', headers = {}, credentials } = config;
  
  if (!endpoint) {
    throw new Error('Endpoint is required for custom API integration');
  }
  
  await context.logMessage(`Executing custom API call to ${endpoint}`, 'info', context.nodeId);
  
  // Prepare headers including authentication
  const requestHeaders: Record<string, string> = { ...headers };
  
  if (credentials) {
    switch (credentials.type) {
      case 'api_key':
        requestHeaders[credentials.header_name || 'X-API-Key'] = credentials.api_key;
        break;
        
      case 'bearer':
        requestHeaders['Authorization'] = `Bearer ${credentials.access_token}`;
        break;
        
      case 'basic':
        const basicAuth = btoa(`${credentials.username}:${credentials.password}`);
        requestHeaders['Authorization'] = `Basic ${basicAuth}`;
        break;
    }
  }
  
  // In production, use node-fetch or axios instead of the browser fetch
  try {
    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
      redirect: 'follow',
    };
    
    // Add body for non-GET requests
    if (method !== 'GET' && data) {
      requestOptions.body = JSON.stringify(data);
      
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
    }
    
    // Make the API call
    const response = await fetch(endpoint, requestOptions);
    
    // Check if the response is successful
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    
    // Parse the response
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    throw new Error(`API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Simulation functions for third-party APIs
// These would be replaced with actual API calls in a real implementation

function simulateXeroCreateInvoice(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        invoiceId: 'INV-' + Math.floor(Math.random() * 100000),
        date: new Date().toISOString(),
        status: 'DRAFT',
        total: data.total || 0,
        customer: data.customer,
        lineItems: data.lineItems || [],
      });
    }, 500);
  });
}

function simulateXeroGetInvoices(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        invoices: [
          {
            invoiceId: 'INV-12345',
            date: new Date().toISOString(),
            status: 'PAID',
            total: 1250.00,
            customer: 'ACME Inc',
          },
          {
            invoiceId: 'INV-12346',
            date: new Date().toISOString(),
            status: 'DRAFT',
            total: 950.75,
            customer: 'Globex Corporation',
          },
        ]
      });
    }, 500);
  });
}

function simulateXeroCreateContact(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        contactId: 'CONT-' + Math.floor(Math.random() * 100000),
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: 'ACTIVE',
      });
    }, 500);
  });
}

function simulateSalesforceCreateLead(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: 'LEAD-' + Math.floor(Math.random() * 100000),
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        company: data.company,
        status: 'NEW',
        createdDate: new Date().toISOString(),
      });
    }, 700);
  });
}

function simulateSalesforceGetOpportunities(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        records: [
          {
            id: 'OPP-12345',
            name: 'New Enterprise Deal',
            stage: 'Qualification',
            amount: 75000,
            closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            probability: 20,
          },
          {
            id: 'OPP-12346',
            name: 'Product Expansion',
            stage: 'Proposal',
            amount: 45000,
            closeDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            probability: 60,
          },
        ],
        totalSize: 2,
        done: true,
      });
    }, 600);
  });
}

function simulateSalesforceUpdateAccount(data: any, credentials: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: data.id,
        success: true,
        updatedFields: Object.keys(data).filter(key => key !== 'id'),
      });
    }, 500);
  });
}

function simulateGoogleSheetsAppendValues(data: any, credentials: any, config: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        spreadsheetId: config.spreadsheetId || 'SHEET-12345',
        updatedRange: config.range || 'Sheet1!A1:D10',
        updatedRows: Array.isArray(data) ? data.length : 1,
        updatedColumns: 4,
        updatedCells: (Array.isArray(data) ? data.length : 1) * 4,
      });
    }, 400);
  });
}

function simulateGoogleSheetsGetValues(data: any, credentials: any, config: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate sample data based on range
      const range = config.range || 'Sheet1!A1:D10';
      const [sheet, cellRange] = range.split('!');
      const [startCell, endCell] = cellRange.split(':');
      
      const startCol = startCell.match(/[A-Z]+/)[0];
      const startRow = parseInt(startCell.match(/\d+/)[0], 10);
      
      const endCol = endCell.match(/[A-Z]+/)[0];
      const endRow = parseInt(endCell.match(/\d+/)[0], 10);
      
      const numRows = endRow - startRow + 1;
      const numCols = endCol.charCodeAt(0) - startCol.charCodeAt(0) + 1;
      
      // Generate sample data
      const values = [];
      for (let i = 0; i < numRows; i++) {
        const row = [];
        for (let j = 0; j < numCols; j++) {
          row.push(`Value ${i+1}-${j+1}`);
        }
        values.push(row);
      }
      
      resolve({
        range,
        majorDimension: 'ROWS',
        values,
      });
    }, 400);
  });
}

function simulateGoogleSheetsUpdateValues(data: any, credentials: any, config: any) {
  // Simulate API latency
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        spreadsheetId: config.spreadsheetId || 'SHEET-12345',
        updatedRange: config.range || 'Sheet1!A1:D10',
        updatedRows: Array.isArray(data) ? data.length : 1,
        updatedColumns: 4,
        updatedCells: (Array.isArray(data) ? data.length : 1) * 4,
      });
    }, 400);
  });
}
