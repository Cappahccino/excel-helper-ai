import { FILE_CONFIG } from "@/config/fileConfig";

export const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
};

export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS.includes(fileExtension)) {
    return { isValid: false, error: "Invalid file type. Please upload an Excel file." };
  }

  if (!FILE_CONFIG.MIME_TYPES.includes(file.type)) {
    return { isValid: false, error: "Invalid file format. Please upload a valid Excel file." };
  }

  if (file.size > FILE_CONFIG.MAX_FILE_SIZE) {
    return { isValid: false, error: "File size exceeds 10MB limit." };
  }

  return { isValid: true };
};