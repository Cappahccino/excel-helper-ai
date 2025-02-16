
import { Spinner } from "../ui/spinner";

export function MessageLoadingState() {
  return (
    <div className="flex items-center gap-2 mt-2">
      <Spinner variant="ring" className="h-4 w-4 text-blue-600" />
      <span className="text-sm text-gray-600">
        Thinking...
      </span>
    </div>
  );
}
