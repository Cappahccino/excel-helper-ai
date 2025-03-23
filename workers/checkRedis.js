const Redis = require('ioredis');
const { Queue } = require('bullmq');
require('dotenv').config();

async function checkRedisConnection() {
  console.log('Checking Redis connection...');
  
  try {
    const redis = new Redis(process.env.REDIS_URL);
    
    redis.on('connect', () => {
      console.log('Successfully connected to Redis');
    });
    
    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    // Test Redis connection
    await redis.ping();
    console.log('Redis PING successful');
    
    // Initialize queue
    const messageQueue = new Queue('message-processing', { connection: redis });
    
    // Get queue metrics
    const jobCounts = await messageQueue.getJobCounts();
    console.log('Queue job counts:', jobCounts);
    
    // Get active jobs
    const activeJobs = await messageQueue.getActive();
    console.log('Active jobs:', activeJobs);
    
    // Get waiting jobs
    const waitingJobs = await messageQueue.getWaiting();
    console.log('Waiting jobs:', waitingJobs);
    
    // Get failed jobs
    const failedJobs = await messageQueue.getFailed();
    console.log('Failed jobs:', failedJobs);
    
    // Clean up
    await redis.quit();
    console.log('Redis connection closed');
  } catch (error) {
    console.error('Error checking Redis:', error);
  }
}

checkRedisConnection().catch(console.error); 