import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workflowId, nodeId, sourceNodeId, config } = req.body;

    if (!workflowId || !nodeId || !sourceNodeId || !config) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get source node data
    const { data: sourceData, error: sourceError } = await supabase.functions.invoke(
      'process-excel',
      {
        body: {
          workflowId,
          nodeId: sourceNodeId,
          operation: 'preview',
          maxRows: 100
        }
      }
    );

    if (sourceError) {
      throw new Error(`Error fetching source data: ${sourceError.message}`);
    }

    // Process the data with the aggregation configuration
    const { data: processedData, error: processError } = await supabase.functions.invoke(
      'process-excel',
      {
        body: {
          operation: 'aggregate',
          data: sourceData.result?.processedData || [],
          configuration: config,
          nodeId,
          workflowId,
          maxRows: 10
        }
      }
    );

    if (processError) {
      throw new Error(`Error processing data: ${processError.message}`);
    }

    return res.status(200).json({
      data: processedData.result?.processedData || null
    });
  } catch (error) {
    console.error('Error in preview-node API:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An error occurred while generating preview'
    });
  }
} 