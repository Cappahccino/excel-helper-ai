import { LayoutDashboard, UserCog, Settings, LogOut } from "lucide-react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { useState } from "react";
import { cn } from "@/lib/utils";

const links = [
  {
    label: "Dashboard",
    href: "#",
    icon: <LayoutDashboard className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
  },
  {
    label: "Profile",
    href: "#",
    icon: <UserCog className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
  },
  {
    label: "Settings",
    href: "#",
    icon: <Settings className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
  },
  {
    label: "Logout",
    href: "#",
    icon: <LogOut className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
  }
];

export function AppSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={open} onOpenChange={setOpen}>
      <Sidebar>
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm flex-shrink-0" />
          <div className="mt-8 flex flex-col gap-2">
            {links.map((link, idx) => (
              <a
                key={idx}
                href={link.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
              >
                {link.icon}
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}