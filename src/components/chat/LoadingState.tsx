
import { Spinner } from "../ui/spinner";

export function LoadingState() {
  return (
    <div className="flex items-center gap-2 p-4 bg-blue-50/50 rounded-lg ml-4 shadow-sm">
      <Spinner variant="ring" className="text-excel h-5 w-5" />
      <div className="flex flex-col">
        <p className="text-sm text-gray-700">Assistant is thinking...</p>
        <p className="text-xs text-gray-500">This may take a few seconds</p>
      </div>
    </div>
  );
}
