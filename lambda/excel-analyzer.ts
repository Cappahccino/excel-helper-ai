import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getFileMetadata, downloadExcelFile, storeUserMessage, storeAIResponse, updateFileAccess } from './services/supabase';
import { processExcelFile } from './services/excel';
import { analyzeExcelData } from './services/openai';

interface RequestBody {
  fileId: string;
  query: string;
  userId: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const { fileId, query, userId } = JSON.parse(event.body || '{}') as RequestBody;

    if (!fileId || !query || !userId) {
      throw new Error('Missing required fields: fileId, query, and userId are required');
    }

    console.log('Processing request for:', { fileId, userId });

    // Get file metadata and store user message
    const fileData = await getFileMetadata(fileId);
    await storeUserMessage(query, fileId, userId);
    console.log('File metadata retrieved and user message stored');

    // Download and process Excel file
    const fileBuffer = await downloadExcelFile(fileData.file_path);
    const jsonData = await processExcelFile(await fileBuffer.arrayBuffer());
    console.log('Excel file processed');

    // Get OpenAI analysis
    const completion = await analyzeExcelData(jsonData, query);
    console.log('OpenAI analysis received');

    // Store AI response and update file access
    await storeAIResponse(completion, fileId, userId);
    await updateFileAccess(fileId);
    console.log('AI response stored and file access updated');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        openAiResponse: completion,
        message: completion.choices[0].message.content,
        fileName: fileData.filename,
        fileSize: fileData.file_size,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      })
    };
  }
};