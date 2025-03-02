
import { NodeInputs, NodeOutputs, NodeTypeDefinition } from '@/types/workflow';

// Helper function to make API requests
async function makeApiRequest(endpoint: string, method: string, headers: Record<string, string>, body: any): Promise<any> {
  try {
    const options: RequestInit = {
      method,
      headers,
      credentials: 'include',
    };
    
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(endpoint, options);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

// Handle API source node
export async function handleApiSource(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const { endpoint, method = 'GET', headers = {}, body = null } = config;
  
  if (!endpoint) {
    return { data: [] };
  }
  
  try {
    const responseData = await makeApiRequest(endpoint, method, headers, body);
    
    // Handle different response formats
    if (Array.isArray(responseData)) {
      return { data: responseData };
    } else if (typeof responseData === 'object' && responseData !== null) {
      // Check if response has a data property that is an array
      if (Array.isArray(responseData.data)) {
        return { data: responseData.data };
      }
      
      // Check if response has a results property that is an array
      if (Array.isArray(responseData.results)) {
        return { data: responseData.results };
      }
      
      // Check if response has an items property that is an array
      if (Array.isArray(responseData.items)) {
        return { data: responseData.items };
      }
      
      // If we couldn't find a suitable array, wrap the entire response in an array
      return { data: [responseData] };
    } else {
      // For primitive responses, create a single-item array
      return { data: [{ value: responseData }] };
    }
  } catch (error) {
    console.error('Error in API source node:', error);
    return { data: [], error: String(error) };
  }
}

// Handle API request node (for making API calls with data from previous nodes)
export async function handleApiRequest(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const { endpoint, method = 'POST', headers = {}, bodyTemplate = null } = config;
  const data = inputs.data || [];
  
  if (!endpoint) {
    return { data: [] };
  }
  
  try {
    // Prepare the request body based on the template and input data
    let body = bodyTemplate;
    
    if (bodyTemplate && typeof bodyTemplate === 'object') {
      // Deep clone to avoid modifying the template
      body = JSON.parse(JSON.stringify(bodyTemplate));
      
      // Replace placeholders with actual data
      const replacePlaceholders = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return obj;
        }
        
        if (Array.isArray(obj)) {
          return obj.map(replacePlaceholders);
        }
        
        const result: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
            const placeholder = value.slice(2, -2).trim();
            if (placeholder === 'data') {
              result[key] = data;
            } else if (placeholder.startsWith('data[') && placeholder.endsWith(']')) {
              const index = parseInt(placeholder.slice(5, -1), 10);
              result[key] = data[index] || null;
            } else {
              result[key] = value; // Keep as is if not recognized
            }
          } else if (typeof value === 'object' && value !== null) {
            result[key] = replacePlaceholders(value);
          } else {
            result[key] = value;
          }
        }
        
        return result;
      };
      
      body = replacePlaceholders(body);
    } else if (!body && data.length > 0) {
      // If no body template is provided, use the input data
      body = data;
    }
    
    const responseData = await makeApiRequest(endpoint, method, headers, body);
    
    // Handle different response formats (similar to handleApiSource)
    if (Array.isArray(responseData)) {
      return { data: responseData };
    } else if (typeof responseData === 'object' && responseData !== null) {
      if (Array.isArray(responseData.data)) {
        return { data: responseData.data };
      }
      
      if (Array.isArray(responseData.results)) {
        return { data: responseData.results };
      }
      
      if (Array.isArray(responseData.items)) {
        return { data: responseData.items };
      }
      
      return { data: [responseData] };
    } else {
      return { data: [{ value: responseData }] };
    }
  } catch (error) {
    console.error('Error in API request node:', error);
    return { data: [], error: String(error) };
  }
}

export const apiSourceNodeDefinition: NodeTypeDefinition = {
  type: 'apiSource',
  name: 'API Source',
  category: 'input',
  description: 'Fetches data from an API endpoint',
  icon: 'globe',
  defaultConfig: {
    endpoint: '',
    method: 'GET',
    headers: {},
    body: null
  },
  inputs: [],
  outputs: [
    {
      name: 'data',
      type: 'data',
      dataType: 'array'
    }
  ]
};
