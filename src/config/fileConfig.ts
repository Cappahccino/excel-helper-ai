export const FILE_CONFIG = {
  ALLOWED_EXCEL_EXTENSIONS: [
    '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm', '.xls', 
    '.xlt', '.xml', '.xlam', '.xla', '.xlw', '.xlr', '.csv'
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MIME_TYPES: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
} as const;