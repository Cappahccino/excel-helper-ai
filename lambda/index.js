const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

// Initialize Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeWithOpenAI(excelData, query) {
    console.log('Sending request to OpenAI');
    
    const sheets = Object.keys(excelData).map(sheetName => {
        const sheet = excelData[sheetName];
        return {
            name: sheetName,
            data: XLSX.utils.sheet_to_json(sheet)
        };
    });

    const prompt = `Analyze this Excel data:\n${JSON.stringify(sheets, null, 2)}\n\nUser's question: ${query}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert data analyst. Analyze Excel data and provide clear, insightful responses.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        const result = await response.json();
        
        console.log('Raw OpenAI response:', JSON.stringify(result, null, 2));
        console.log('Response metadata:', {
            chat_id: result.id,
            model: result.model,
            usage: result.usage
        });

        if (result.error) {
            throw new Error(`OpenAI API error: ${result.error.message}`);
        }

        if (!result.choices || !result.choices.length) {
            throw new Error('Invalid response format from OpenAI: missing choices');
        }

        const choice = result.choices[0];
        if (!choice.message || typeof choice.message.content !== 'string') {
            throw new Error('Invalid response format from OpenAI: missing or invalid message content');
        }

        const cleanResponse = {
            id: result.id,
            model: result.model,
            created: result.created,
            usage: result.usage,
            choices: result.choices,
            system_fingerprint: result.system_fingerprint
        };

        const processedResponse = {
            id: result.id,
            model: result.model,
            usage: result.usage,
            responseContent: choice.message.content,
            raw_response: cleanResponse
        };

        console.log('Processed OpenAI response:', processedResponse);
        return processedResponse;

    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling CORS preflight request');
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const { fileId, query, userId } = JSON.parse(event.body);
        console.log('Parsed request:', { fileId, query, userId });
        
        if (!fileId || !query || !userId) {
            throw new Error('Missing required fields: fileId, query, and userId are required');
        }

        console.log('Fetching file metadata for ID:', fileId);
        const { data: fileData, error: fileError } = await supabase
            .from('excel_files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fileError || !fileData) {
            console.error('File metadata error:', fileError);
            throw new Error('File not found');
        }
        console.log('File metadata retrieved:', fileData);

        // Store user's message first
        const { data: userMessage, error: userMessageError } = await supabase
            .from('chat_messages')
            .insert({
                content: query,
                excel_file_id: fileId,
                is_ai_response: false,
                user_id: userId
            })
            .select()
            .single();

        if (userMessageError) {
            console.error('Error storing user message:', userMessageError);
            throw userMessageError;
        }
        console.log('User message stored successfully:', userMessage);

        console.log('Attempting to download file:', fileData.file_path);
        const { data: fileBuffer, error: downloadError } = await supabase
            .storage
            .from('excel_files')
            .download(fileData.file_path);

        if (downloadError) {
            console.error('File download error:', downloadError);
            throw new Error('Error downloading file');
        }
        console.log('File downloaded successfully, size:', fileBuffer.length);

        console.log('Parsing Excel file');
        const workbook = XLSX.read(await fileBuffer.arrayBuffer());
        
        console.log('Starting OpenAI analysis');
        const analysisResult = await analyzeWithOpenAI(workbook.Sheets, query);
        console.log('Analysis completed');

        // Update the original user message with chat_id
        const { error: updateUserMessageError } = await supabase
            .from('chat_messages')
            .update({ chat_id: analysisResult.id })
            .eq('id', userMessage.id);

        if (updateUserMessageError) {
            console.error('Error updating user message with chat_id:', updateUserMessageError);
            throw updateUserMessageError;
        }

        // Store AI response in chat_messages
        const { data: aiMessage, error: aiMessageError } = await supabase
            .from('chat_messages')
            .insert({
                content: analysisResult.responseContent,
                excel_file_id: fileId,
                is_ai_response: true,
                user_id: userId,
                chat_id: analysisResult.id,
                openai_model: analysisResult.model,
                openai_usage: analysisResult.usage,
                raw_response: analysisResult.raw_response
            })
            .select()
            .single();

        if (aiMessageError) {
            console.error('Error storing AI response:', aiMessageError);
            throw aiMessageError;
        }

        console.log('AI message stored successfully:', aiMessage);

        // Update last_accessed timestamp
        const { error: updateError } = await supabase
            .from('excel_files')
            .update({ last_accessed: new Date().toISOString() })
            .eq('id', fileId);

        if (updateError) throw updateError;

        const analysis = {
            fileName: fileData.filename,
            fileSize: fileData.file_size,
            message: analysisResult.responseContent,
            userId: userId,
            chatId: analysisResult.id,
            openAiResponse: {
                id: analysisResult.id,
                model: analysisResult.model,
                usage: analysisResult.usage,
                responseContent: analysisResult.responseContent
            },
            timestamp: new Date().toISOString()
        };

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(analysis)
        };

    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: error instanceof Error ? error.message : 'An unexpected error occurred'
            })
        };
    }
};