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

async function checkRedisConnection() {
  console.log('Checking Redis connection and queue status...');
  
  try {
    // Test connection with PING
    console.log('\nTesting connection...');
    const pingResult = await upstashRedis('ping');
    console.log('Redis PING result:', pingResult);

    // Get queue length
    console.log('\nChecking queue length...');
    const queueLength = await upstashRedis('llen', 'message-processing');
    console.log('Messages in queue:', queueLength);

    // Get queue contents without removing them
    console.log('\nChecking queue contents...');
    const queueContents = await upstashRedis('lrange', 'message-processing', '0', '9');
    
    if (queueContents && queueContents.length > 0) {
      console.log('\nFirst 10 messages in queue:');
      queueContents.forEach((item, index) => {
        try {
          const decodedData = decodeURIComponent(item);
          const message = JSON.parse(decodedData);
          console.log(`\nMessage ${index + 1}:`, {
            id: message.id,
            messageId: message.data?.messageId,
            timestamp: new Date(message.timestamp).toISOString(),
            attempts: message.attempts,
            isTextOnly: message.data?.isTextOnly
          });
        } catch (error) {
          console.log(`Message ${index + 1} (parse error):`, item);
        }
      });
    } else {
      console.log('Queue is empty');
    }

    console.log('\nRedis check completed successfully');
  } catch (error) {
    console.error('Error checking Redis:', error);
  }
}

// Run the check
checkRedisConnection().catch(console.error); 