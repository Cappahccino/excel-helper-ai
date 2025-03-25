
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

function startWorker(scriptName, logPrefix) {
  console.log(`Starting ${scriptName}...`);
  
  const worker = spawn('node', [scriptName], {
    cwd: __dirname,
    stdio: 'pipe',
    env: process.env
  });

  // Handle worker output
  worker.stdout.on('data', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${logPrefix}-OUT] ${data.toString().trim()}`);
  });

  worker.stderr.on('data', (data) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${logPrefix}-ERR] ${data.toString().trim()}`);
  });

  // Handle worker exit
  worker.on('exit', (code, signal) => {
    const timestamp = new Date().toISOString();
    if (code !== null) {
      console.error(`[${timestamp}] ${logPrefix} exited with code ${code}`);
    } else if (signal !== null) {
      console.error(`[${timestamp}] ${logPrefix} was killed with signal ${signal}`);
    }
    
    // Restart worker after delay
    console.log(`[${timestamp}] Restarting ${logPrefix} in 5 seconds...`);
    setTimeout(() => {
      startWorker(scriptName, logPrefix);
    }, 5000);
  });

  // Handle worker errors
  worker.on('error', (error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${logPrefix} error:`, error);
  });

  return worker;
}

// Start the workers
const messageWorker = startWorker('messageWorker.js', 'MESSAGE-WORKER');
const recoveryWorker = startWorker('recoveryWorker.js', 'RECOVERY-WORKER');

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down workers...');
  messageWorker.kill('SIGTERM');
  recoveryWorker.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down workers...');
  messageWorker.kill('SIGINT');
  recoveryWorker.kill('SIGINT');
});
