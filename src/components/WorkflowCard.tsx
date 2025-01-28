import { ReactNode } from "react";

interface WorkflowCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  runs: string;
}

export function WorkflowCard({ icon, title, description, runs }: WorkflowCardProps) {
  return (
    <div className="group relative rounded-lg border p-6 hover:border-foreground">
      <div className="flex items-center gap-4">
        <div className="rounded-full border p-2 group-hover:border-foreground">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="text-sm text-muted-foreground">
          {runs}
        </div>
      </div>
    </div>
  );
}