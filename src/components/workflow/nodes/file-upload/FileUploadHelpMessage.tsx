
import React from 'react';
import { InfoIcon } from 'lucide-react';

const FileUploadHelpMessage: React.FC = () => {
  return (
    <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100 flex items-start space-x-2">
      <InfoIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
      <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
    </div>
  );
};

export default FileUploadHelpMessage;
