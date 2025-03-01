
import { OPENAI_CONFIG } from "./config.ts";

/**
 * Extracts the file extension from a filename
 * @param filename The filename to extract the extension from
 * @returns The file extension including the dot (e.g., ".xlsx")
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return `.${parts[parts.length - 1].toLowerCase()}`;
}

/**
 * Gets the MIME type for a given file extension
 * @param extension The file extension including the dot (e.g., ".xlsx")
 * @returns The corresponding MIME type or a default if not found
 */
export function getMimeTypeFromExtension(extension: string): string {
  const mimeMap: Record<string, string> = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
    '.xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    '.xltx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    '.xltm': 'application/vnd.ms-excel.template.macroEnabled.12',
    '.xls': 'application/vnd.ms-excel',
    '.xlt': 'application/vnd.ms-excel',
    '.xml': 'application/xml',
    '.xlam': 'application/vnd.ms-excel.addin.macroEnabled.12',
    '.xla': 'application/vnd.ms-excel',
    '.xlw': 'application/vnd.ms-excel',
    '.xlr': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
  };

  const mimeType = mimeMap[extension.toLowerCase()] || 'application/octet-stream';
  return mimeType;
}

/**
 * Checks if a file extension is a supported Excel format
 * @param extension The file extension to check
 * @returns True if the extension is supported, false otherwise
 */
export function isSupportedExcelExtension(extension: string): boolean {
  if (!extension) return false;
  return OPENAI_CONFIG.SUPPORTED_EXTENSIONS.includes(extension.toLowerCase());
}
