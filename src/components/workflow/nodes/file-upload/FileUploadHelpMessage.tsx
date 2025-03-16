
import React from 'react';

const FileUploadHelpMessage: React.FC = () => {
  return (
    <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 border border-blue-100 shadow-sm transition-all duration-300 animate-fade-in hover:bg-blue-100">
      <p>Select a file to use in this workflow. You can upload files in the Files section.</p>
    </div>
  );
};

export default FileUploadHelpMessage;
