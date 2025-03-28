const fetch = require('node-fetch');
require('dotenv').config();

// Helper function to make Upstash Redis REST API calls
async function upstashRedis(command, ...args) {
  console.log(`Executing Redis command: ${command} with args:`, args);
  
  try {
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/${command}/${args.join('/')}`;
    console.log(`Redis API request URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Upstash Redis API error (${response.status}):`, error);
      throw new Error(`Upstash Redis API error: ${error}`);
    }

    const result = await response.json();
    console.log(`Redis command result:`, result);
    return result.result;
  } catch (error) {
    console.error(`Redis command error (${command}):`, error);
    throw error;
  }
}

async function checkQueueStatus() {
  console.log('Checking queue status...');
  
  try {
    // Get queue length
    const queueLength = await upstashRedis('llen', 'message-processing');
    console.log('\nQueue Status:');
    console.log('Messages in queue:', queueLength);

    if (queueLength > 0) {
      // Get the first message without removing it
      const nextMessage = await upstashRedis('lindex', 'message-processing', '0');
      
      try {
        const decodedData = decodeURIComponent(nextMessage);
        const message = JSON.parse(decodedData);
        console.log('\nNext message in queue:', {
          id: message.id,
          messageId: message.data?.messageId,
          timestamp: new Date(message.timestamp).toISOString(),
          attempts: message.attempts,
          isTextOnly: message.data?.isTextOnly
        });
      } catch (error) {
        console.log('Error parsing next message:', nextMessage);
      }

      // Get queue distribution (last 10 messages)
      const recentMessages = await upstashRedis('lrange', 'message-processing', '0', '9');
      
      const messageTypes = recentMessages.reduce((acc, item) => {
        try {
          const decodedData = decodeURIComponent(item);
          const message = JSON.parse(decodedData);
          const type = message.data?.isTextOnly ? 'text_only' : 'with_files';
          acc[type] = (acc[type] || 0) + 1;
        } catch (error) {
          acc.invalid = (acc.invalid || 0) + 1;
        }
        return acc;
      }, {});

      console.log('\nMessage type distribution (last 10):', messageTypes);
    }

    console.log('\nQueue check completed successfully');
  } catch (error) {
    console.error('Error checking queue status:', error);
  }
}

// Run the check
checkQueueStatus().catch(console.error); 