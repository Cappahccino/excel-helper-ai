
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  const desktopProps = { ...props };
  const mobileProps = { className: props.className, children: props.children as React.ReactNode };
  
  return (
    <>
      <DesktopSidebar {...desktopProps} />
      <MobileSidebar {...mobileProps} />
    </>
  );
};

export const SidebarContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex-1", className)}>{children}</div>
);

export const SidebarHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center", className)}>{children}</div>
);

export const SidebarGroup = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-4", className)}>{children}</div>
);

export const SidebarGroupLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h3 className={cn("text-sm font-medium text-muted-foreground px-2", className)}>{children}</h3>
);

export const SidebarGroupContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1", className)}>{children}</div>
);

export const SidebarMenu = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1", className)}>{children}</div>
);

export const SidebarMenuItem = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("px-2", className)}>{children}</div>
);

export const SidebarMenuButton = ({ 
  children, 
  className,
  onClick,
  ...props
}: { 
  children: React.ReactNode; 
  className?: string;
  onClick?: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={cn(
      "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent",
      className
    )}
    onClick={onClick}
    {...props}
  >
    {children}
  </button>
);

const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col bg-neutral-100 dark:bg-neutral-800 w-[300px] flex-shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? "300px" : "60px") : "300px",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

const MobileSidebar = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-10 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full"
        )}
      >
        <div className="flex justify-end z-20 w-full">
          <Menu
            className="text-neutral-800 dark:text-neutral-200 cursor-pointer"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-white dark:bg-neutral-900 p-10 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200 cursor-pointer"
                onClick={() => setOpen(!open)}
              >
                <X />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
