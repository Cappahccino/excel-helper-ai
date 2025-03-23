
import { messageQueue } from './messageWorker.js';
import { fileQueue } from './fileWorker.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('Starting all workers...');

// Add some monitoring information
async function printQueueStats() {
  try {
    const messageJobs = await messageQueue.getJobCounts();
    const fileJobs = await fileQueue.getJobCounts();
    
    console.log('Current queue status:');
    console.log('Message queue:', messageJobs);
    console.log('File queue:', fileJobs);
  } catch (error) {
    console.error('Error getting queue stats:', error);
  }
}

// Print stats on startup and every minute
printQueueStats();
setInterval(printQueueStats, 60000);

console.log('Workers are running...');
