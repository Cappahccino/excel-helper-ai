
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useId } from "react";
import { SignUpForm } from "./auth/SignUpForm";

export function SignUpDialog() {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-500 text-white hover:bg-green-600">Sign up</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white border border-border overflow-hidden" aria-hidden="true">
            <img 
              src="/lovable-uploads/web_logo.png" 
              alt="Tallyze Logo" 
              className="w-full h-full object-contain p-1"
            />
          </div>
          <DialogHeader>
            <DialogTitle className="sm:text-center">Sign up to Tallyze!</DialogTitle>
            <DialogDescription className="sm:text-center">
              We just need a few details to get you started.
            </DialogDescription>
          </DialogHeader>
        </div>

        <SignUpForm id={id} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>;
}
