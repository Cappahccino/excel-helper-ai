import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

const Index = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error: dbError } = await supabase
        .from("waitlist_users")
        .insert([{ email }]);

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke("send-waitlist-email", {
        body: { email },
      });

      if (emailError) throw emailError;

      setSubmitted(true);
      setEmail("");
      toast({
        title: "Success!",
        description: "You've been added to our waitlist. Check your email for confirmation.",
      });
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen animated-bg flex flex-col">
      {/* Logo with Floating Animation */}
      <motion.div 
        className="flex justify-center items-center mt-8 mb-8"
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        <span className="text-[#3cbd84] text-3xl md:text-4xl font-bold italic font-['Jersey_25']">
          Tallyze
        </span>
      </motion.div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl w-full mx-auto text-center">
          {/* Animated Headings */}
          <motion.h1 
            className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight font-['Darker_Grotesque']"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", staggerChildren: 0.3 }}
          >
            <motion.span className="block mb-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              Automate.
            </motion.span>
            <motion.span className="block mb-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              Analyze.
            </motion.span>
            <motion.span className="block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              Accelerate.
            </motion.span>
          </motion.h1>

          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto font-['Darker_Grotesque'] mt-4">
            Streamline your Financial Operations with Tallyze
          </p>

          <div className="w-24 h-1 bg-[#27B67A] mx-auto rounded-full mt-6"></div>

          {/* Waitlist Form with Glassmorphism */}
          <div className="max-w-md mx-auto bg-white/40 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/20 mt-8">
            {submitted ? (
              <div className="text-gray-900 font-semibold text-xl">
                ✅ Thank you for joining! We'll notify you when we launch.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="group">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full px-6 py-4 rounded-xl border-2 border-[#27B67A]/20 bg-transparent 
                                placeholder:text-gray-400 text-gray-900 focus:outline-none focus:border-[#27B67A]/40 
                                shadow-lg transition-all duration-300 font-['Darker_Grotesque']"
                    />
                  </div>
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-[#27B67A] text-white px-8 py-4 rounded-xl font-medium flex items-center justify-center gap-2 
                              hover:bg-[#229163] transition-all duration-300 shadow-lg disabled:opacity-50 font-['Darker_Grotesque']"
                  >
                    <span>{isLoading ? "Joining..." : "Join Waitlist"}</span>
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </div>
                <p className="text-gray-500 text-sm mt-4 font-['Darker_Grotesque']">
                  We respect your privacy
                </p>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative w-full py-8">
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#F2FCE2]/50 to-transparent pointer-events-none"></div>
      </footer>
    </div>
  );
};

export default Index;
