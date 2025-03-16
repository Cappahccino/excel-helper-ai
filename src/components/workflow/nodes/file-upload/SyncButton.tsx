
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface SyncButtonProps {
  onClick: () => Promise<void>;
  disabled: boolean;
}

const SyncButton: React.FC<SyncButtonProps> = ({ onClick, disabled }) => {
  // Handle click with proper event propagation
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  };

  return (
    <Button 
      size="sm" 
      variant="outline" 
      className="w-full text-xs mt-2 relative z-10"
      onClick={handleClick}
      disabled={disabled}
    >
      <RefreshCw className="h-3.5 w-3.5 mr-2" />
      Sync Schema with Connected Nodes
    </Button>
  );
};

export default SyncButton;
