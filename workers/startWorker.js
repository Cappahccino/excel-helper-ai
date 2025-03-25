require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

function startWorker() {
  console.log('Starting message worker...');
  
  const worker = spawn('node', ['messageWorker.js'], {
    cwd: __dirname,
    stdio: 'pipe',
    env: process.env
  });

  // Handle worker output
  worker.stdout.on('data', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [WORKER-OUT] ${data.toString().trim()}`);
  });

  worker.stderr.on('data', (data) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [WORKER-ERR] ${data.toString().trim()}`);
  });

  // Handle worker exit
  worker.on('exit', (code, signal) => {
    const timestamp = new Date().toISOString();
    if (code !== null) {
      console.error(`[${timestamp}] Worker exited with code ${code}`);
    } else if (signal !== null) {
      console.error(`[${timestamp}] Worker was killed with signal ${signal}`);
    }
    
    // Restart worker after delay
    console.log(`[${timestamp}] Restarting worker in 5 seconds...`);
    setTimeout(() => {
      startWorker();
    }, 5000);
  });

  // Handle worker errors
  worker.on('error', (error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Worker error:`, error);
  });

  return worker;
}

// Start the worker
const worker = startWorker();

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down worker...');
  worker.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down worker...');
  worker.kill('SIGINT');
}); 