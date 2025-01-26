import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconBrandGoogle } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface SignUpFormProps {
  id: string;
  onSuccess: () => void;
}

export function SignUpForm({ id, onSuccess }: SignUpFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Please check your email to verify your account.",
      });
      
      onSuccess();
      navigate("/chat");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSignUp} className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-firstName`}>First name</Label>
            <Input 
              id={`${id}-firstName`} 
              placeholder="John" 
              type="text" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-lastName`}>Last name</Label>
            <Input 
              id={`${id}-lastName`} 
              placeholder="Doe" 
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input 
              id={`${id}-email`} 
              placeholder="john@example.com" 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-password`}>Password</Label>
            <Input
              id={`${id}-password`}
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Sign up"}
        </Button>
      </form>

      <div className="flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        <span className="text-xs text-muted-foreground">Or</span>
      </div>

      <Button variant="outline" className="w-full flex gap-2 items-center justify-center">
        <IconBrandGoogle className="h-4 w-4" />
        Continue with Google
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        By signing up you agree to our{" "}
        <a className="underline hover:no-underline" href="#">
          Terms
        </a>
        .
      </p>
    </>
  );
}