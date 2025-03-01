
export const FILE_CONFIG = {
  ALLOWED_EXCEL_EXTENSIONS: [
    '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm', '.xls', 
    '.xlt', '.xml', '.xlam', '.xla', '.xlw', '.xlr', '.csv'
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MIME_TYPES: [
    // Modern Excel formats
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Excel macro-enabled formats
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    // Excel binary format
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    // Legacy Excel formats
    'application/vnd.ms-excel',
    // Excel add-in formats
    'application/vnd.ms-excel.addin.macroEnabled.12',
    // CSV format
    'text/csv',
    // XML spreadsheet format
    'application/xml',
    // Some systems might use these alternative MIME types
    'application/octet-stream',
    'application/x-csv',
    'text/x-csv',
    'text/plain'
  ]
} as const;
