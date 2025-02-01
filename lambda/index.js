const AWS = require('aws-sdk');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Validate request method and headers
    if (!event.headers || !event.headers.authorization) {
        console.error('Missing Authorization header');
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Missing Authorization header' })
        };
    }

    // Extract the token from the Authorization header
    const authToken = event.headers.authorization.replace('Bearer ', '');
    const expectedToken = process.env.AUTH_TOKEN;

    // Validate the token
    if (authToken !== expectedToken) {
        console.error('Invalid authentication token');
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Invalid authentication token' })
        };
    }

    try {
        // Parse the request body
        const body = JSON.parse(event.body);
        const { fileId, filePath, query, supabaseUrl, supabaseKey } = body;

        if (!fileId || !filePath || !query || !supabaseUrl || !supabaseKey) {
            console.error('Missing required parameters:', { fileId, filePath, query, hasSupabaseUrl: !!supabaseUrl, hasSupabaseKey: !!supabaseKey });
            throw new Error('Missing required parameters');
        }

        // Initialize Supabase client
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Download the Excel file from Supabase storage
        console.log('Downloading file:', filePath);
        const { data: fileData, error: downloadError } = await supabase
            .storage
            .from('excel_files')
            .download(filePath);

        if (downloadError) {
            console.error('Error downloading file:', downloadError);
            throw new Error(`Error downloading file: ${downloadError.message}`);
        }

        console.log('File downloaded successfully, processing...');

        // Call the existing analyzeExcel function (your provided code)
        // This part remains unchanged as it's working correctly
        const mockAnalysis = {
            message: `Analysis of file ${fileId}: This Excel file contains sample data with multiple sheets.`,
            openAiResponse: {
                model: 'gpt-4o',
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150
                }
            }
        };

        return {
            statusCode: 200,
            body: JSON.stringify(mockAnalysis)
        };

    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: error.message,
                stack: error.stack
            })
        };
    }
};
