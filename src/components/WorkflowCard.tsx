import { ReactNode } from "react";

interface WorkflowCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  runs: string;
}

export function WorkflowCard({ icon, title, description, runs }: WorkflowCardProps) {
  return (
    <div className="p-6 rounded-xl border border-gray-700/50 bg-gray-800/50 hover:bg-gray-800/70 transition-colors cursor-pointer backdrop-blur-sm">
      <div className="mb-4 text-blue-400">{icon}</div>
      <h4 className="text-lg font-semibold mb-2">{title}</h4>
      <p className="text-gray-400 text-sm mb-4">{description}</p>
      <p className="text-xs text-gray-500">{runs}</p>
    </div>
  );
}