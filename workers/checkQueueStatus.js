require('dotenv').config();
const fetch = require('node-fetch');

async function checkQueueStatus() {
  const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.error('Missing Upstash configuration');
    return;
  }

  try {
    // Check queue length
    const llenResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/llen/message-processing`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    const llenData = await llenResponse.json();
    console.log('Current queue length:', llenData.result);

    // Get all items in queue
    const lrangeResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/lrange/message-processing/0/-1`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    const lrangeData = await lrangeResponse.json();
    
    console.log('\nQueue contents:');
    if (lrangeData.result && lrangeData.result.length > 0) {
      lrangeData.result.forEach((item, index) => {
        try {
          const job = JSON.parse(item);
          console.log(`\nItem ${index + 1}:`);
          console.log('Message ID:', job.id);
          console.log('Timestamp:', new Date(job.timestamp).toISOString());
          console.log('Attempts:', job.attempts);
          console.log('Max Attempts:', job.maxAttempts);
          console.log('User ID:', job.data.userId);
          console.log('Session ID:', job.data.sessionId);
          console.log('File IDs:', job.data.fileIds);
        } catch (parseError) {
          console.error(`Failed to parse item ${index + 1}:`, item);
        }
      });
    } else {
      console.log('Queue is empty');
    }

    // Check worker heartbeat
    const heartbeatResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/get/message_worker_heartbeat`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    const heartbeatData = await heartbeatResponse.json();
    
    if (heartbeatData.result) {
      const lastHeartbeat = parseInt(heartbeatData.result);
      const timeSinceHeartbeat = Date.now() - lastHeartbeat;
      console.log('\nWorker Status:');
      console.log('Last heartbeat:', new Date(lastHeartbeat).toISOString());
      console.log('Time since last heartbeat:', Math.round(timeSinceHeartbeat / 1000), 'seconds');
      console.log('Worker status:', timeSinceHeartbeat > 60000 ? 'POTENTIALLY DEAD' : 'ALIVE');
    } else {
      console.log('\nNo worker heartbeat found');
    }

  } catch (error) {
    console.error('Error checking queue status:', error);
  }
}

// Run the check
checkQueueStatus().catch(console.error); 