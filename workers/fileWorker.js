require('dotenv').config();
const { Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize environment variables
const REDIS_URL = process.env.REDIS_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!REDIS_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Initialize Redis connection
const connection = new Redis(REDIS_URL);

// Set up queue events to monitor the queue
const queueEvents = new QueueEvents('file-processing', { connection });

// Log queue events
queueEvents.on('completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed successfully`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed with reason: ${failedReason}`);
});

// Create a worker to process Excel files
const worker = new Worker('file-processing', async (job) => {
  console.log(`Processing job ${job.id}: ${job.data.filename}`);
  
  try {
    // Update status in database
    await updateFileStatus(job.data.fileId, job.data.workflowId, 'processing', 'downloading');
    
    // Download file from Supabase Storage
    const filePath = await downloadFile(job.data.fileId, job.data.filePath);
    
    // Update status
    await updateFileStatus(job.data.fileId, job.data.workflowId, 'processing', 'analyzing');
    
    // Process the Excel file
    const result = await processExcelFile(filePath, job.data);
    
    // Update status and save results
    await updateFileStatus(
      job.data.fileId, 
      job.data.workflowId, 
      'completed', 
      'completed',
      null,
      result
    );
    
    // Clean up temporary file
    fs.unlinkSync(filePath);
    
    return { success: true, result };
  } catch (error) {
    console.error(`Error processing file ${job.data.fileId}:`, error);
    
    // Update status with error
    await updateFileStatus(
      job.data.fileId, 
      job.data.workflowId, 
      'failed', 
      'error',
      error.message
    );
    
    throw error;
  }
}, {
  connection,
  concurrency: 2, // Number of jobs to process concurrently
  limiter: {
    max: 1000, // Maximum number of jobs processed in duration
    duration: 60000 // Duration in ms for rate limiting (1 minute)
  }
});

// Function to update file status in the database
async function updateFileStatus(fileId, workflowId, status, processingStatus, error = null, result = null) {
  try {
    const updateData = {
      status,
      processing_status: processingStatus,
      processing_error: error,
      processing_completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
    };
    
    if (result) {
      updateData.processing_result = result;
    }
    
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update(updateData)
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId);
      
    if (updateError) {
      console.error(`Failed to update file status: ${updateError.message}`);
    } else {
      console.log(`Updated file ${fileId} status to ${status}:${processingStatus}`);
    }
  } catch (err) {
    console.error('Error updating file status:', err);
  }
}

// Function to download file from Supabase Storage
async function downloadFile(fileId, filePath) {
  console.log(`Downloading file: ${filePath}`);
  
  // Get the file from storage
  const { data, error } = await supabase.storage
    .from('excel_files')
    .download(filePath);
    
  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }
  
  // Save to temporary file
  const tempDir = path.join(os.tmpdir(), 'excel-processing');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFilePath = path.join(tempDir, `${fileId}-${Date.now()}.xlsx`);
  
  // Convert blob to buffer and write to file
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(tempFilePath, buffer);
  
  console.log(`File downloaded to ${tempFilePath}`);
  return tempFilePath;
}

// Function to process Excel file
async function processExcelFile(filePath, jobData) {
  console.log(`Processing Excel file: ${filePath}`);
  
  // Read the workbook
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  
  // Process each sheet
  const sheets = {};
  let totalRows = 0;
  let totalColumns = 0;
  
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Count rows and columns
    const rows = json.length;
    const cols = rows > 0 ? (json[0]?.length || 0) : 0;
    
    totalRows += rows;
    totalColumns = Math.max(totalColumns, cols);
    
    // Sample data (first 10 rows)
    const sampleData = json.slice(0, 10);
    
    // Get header row if it exists
    const headers = rows > 0 ? json[0] : [];
    
    // Add sheet info to result
    sheets[sheetName] = {
      rows,
      columns: cols,
      headers,
      sampleData
    };
  }
  
  // Create file metadata
  const fileMetadata = {
    sheetCount: sheetNames.length,
    sheetNames,
    sheets,
    totalRows,
    totalColumns,
    fileSize: jobData.fileSize,
    fileType: jobData.mimeType,
    processedAt: new Date().toISOString()
  };
  
  // Save metadata to database
  try {
    const { data, error } = await supabase
      .from('file_metadata')
      .upsert({
        file_id: jobData.fileId,
        row_count: totalRows,
        column_definitions: generateColumnDefinitions(sheets),
        data_summary: fileMetadata
      }, {
        onConflict: 'file_id'
      });
      
    if (error) {
      console.error('Failed to save file metadata:', error);
    }
  } catch (err) {
    console.error('Error saving metadata:', err);
  }
  
  return fileMetadata;
}

// Helper function to generate column definitions from sheets
function generateColumnDefinitions(sheets) {
  const columnDefs = {};
  
  Object.keys(sheets).forEach(sheetName => {
    const sheet = sheets[sheetName];
    if (sheet.headers && sheet.headers.length > 0) {
      columnDefs[sheetName] = sheet.headers.map((header, index) => {
        // Try to detect data type from sample data
        const columnValues = sheet.sampleData
          .slice(1) // Skip header row
          .map(row => row[index])
          .filter(val => val !== undefined && val !== null);
        
        const dataType = detectDataType(columnValues);
        
        return {
          name: header || `Column${index+1}`,
          index,
          dataType
        };
      });
    }
  });
  
  return columnDefs;
}

// Helper function to detect data type
function detectDataType(values) {
  if (!values.length) return 'unknown';
  
  // Check if all values are numbers
  const allNumbers = values.every(val => 
    typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val))));
  if (allNumbers) return 'number';
  
  // Check if all values are dates
  const allDates = values.every(val => !isNaN(Date.parse(val)));
  if (allDates) return 'date';
  
  // Otherwise, assume text
  return 'text';
}

// Handle worker events
worker.on('completed', job => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed with error: ${err.message}`);
});

worker.on('error', err => {
  console.error('Worker error:', err);
});

console.log('Excel file processing worker started');
