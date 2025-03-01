
import { FILE_CONFIG } from "@/config/fileConfig";

export const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
};

export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  // First, validate by file extension
  const fileExtension = ('.' + file.name.split('.').pop()?.toLowerCase()) as typeof FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS[number];
  
  if (!FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS.includes(fileExtension)) {
    return { 
      isValid: false, 
      error: `Invalid file type. Supported formats: ${FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS.join(', ')}` 
    };
  }

  // Add more robust MIME type validation with fallbacks
  // Some browsers/systems report different MIME types for the same file type
  const isValidMimeType = FILE_CONFIG.MIME_TYPES.some(mimeType => {
    return file.type === mimeType || 
           // Handle empty MIME types (some browsers might not detect it correctly)
           (file.type === '' && 
            (fileExtension === '.csv' || 
             fileExtension === '.xlsx' || 
             fileExtension === '.xls'));
  });

  if (!isValidMimeType) {
    console.warn(`File MIME type "${file.type}" with extension "${fileExtension}" may not be fully supported`);
    // Don't reject based on MIME type alone if extension is valid
  }

  if (file.size > FILE_CONFIG.MAX_FILE_SIZE) {
    return { isValid: false, error: "File size exceeds 10MB limit." };
  }

  return { isValid: true };
};
