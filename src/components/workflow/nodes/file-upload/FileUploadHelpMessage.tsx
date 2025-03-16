
import React from 'react';
import { FileUpIcon, AlertCircle } from 'lucide-react';

const FileUploadHelpMessage: React.FC = () => {
  return (
    <div className="bg-gray-50 p-3 rounded-md border border-gray-200 text-xs text-gray-600 animate-fade-in">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium mb-1 text-gray-700">No file selected</p>
          <p>Please select a file from your uploaded files or upload a new one to begin.</p>
        </div>
      </div>
    </div>
  );
};

export default FileUploadHelpMessage;
