
import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";
import confetti from "canvas-confetti";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const plans = [
  {
    name: "Starter",
    price: "14.99",
    yearlyPrice: "11.99",
    period: "month",
    features: [
      "Basic Excel file analysis",
      "Limited message quota",
      "Standard support",
      "Basic file storage",
    ],
    description: "Perfect for individuals and small projects",
    buttonText: "Get Started",
    href: "/auth",
    isPopular: false,
  },
  {
    name: "Pro",
    price: "34.99",
    yearlyPrice: "27.99",
    period: "month",
    features: [
      "Everything in Starter",
      "Advanced Excel analysis",
      "Higher message quota",
      "Priority support",
      "Team collaboration",
    ],
    description: "Ideal for growing teams and businesses",
    buttonText: "Upgrade to Pro",
    href: "/auth",
    isPopular: true,
  },
  {
    name: "Pro+",
    price: "79.99",
    yearlyPrice: "63.99",
    period: "month",
    features: [
      "Everything in Pro",
      "Unlimited message quota",
      "Custom integrations",
      "Advanced analytics",
      "Premium support",
    ],
    description: "For teams that need more power and flexibility",
    buttonText: "Upgrade to Pro+",
    href: "/auth",
    isPopular: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    yearlyPrice: "Custom",
    period: "month",
    features: [
      "Custom solutions",
      "Dedicated support",
      "Custom contracts",
      "SLA guarantees",
      "Premium features",
      "Custom integrations",
    ],
    description: "For large organizations with specific needs",
    buttonText: "Contact Sales",
    href: "/contact",
    isPopular: false,
  },
];

export default function Pricing() {
  const [isMonthly, setIsMonthly] = useState(true);
  const switchRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (checked: boolean) => {
    setIsMonthly(!checked);
    if (checked && switchRef.current) {
      const rect = switchRef.current.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      confetti({
        particleCount: 50,
        spread: 60,
        origin: {
          x: x / window.innerWidth,
          y: y / window.innerHeight,
        },
        colors: ["#217346", "#2c974b", "#3b82f6", "#6366f1"],
        ticks: 200,
        gravity: 1.2,
        decay: 0.94,
        startVelocity: 30,
        shapes: ["circle"],
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Choose the plan that works best for you. All plans include access to our Excel analysis tools and dedicated support.
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <label className="relative inline-flex items-center cursor-pointer">
            <Label>
              <Switch
                ref={switchRef as any}
                checked={!isMonthly}
                onCheckedChange={handleToggle}
                className="relative"
              />
            </Label>
          </label>
          <span className="ml-2 font-semibold">
            Annual billing <span className="text-excel">(Save 20%)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 0.5,
                delay: index * 0.1,
              }}
              className={cn(
                "rounded-2xl border p-6 bg-white",
                plan.isPopular ? "border-excel border-2 shadow-lg" : "border-gray-200",
                "flex flex-col"
              )}
            >
              {plan.isPopular && (
                <div className="absolute top-0 right-0 bg-excel py-1 px-3 rounded-bl-xl rounded-tr-xl">
                  <Star className="text-white h-4 w-4 inline-block mr-1" />
                  <span className="text-white text-sm font-semibold">Popular</span>
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="mt-4 flex items-center justify-center">
                  {plan.price === "Custom" ? (
                    <span className="text-4xl font-bold">Custom</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">
                        <NumberFlow
                          value={isMonthly ? Number(plan.price) : Number(plan.yearlyPrice)}
                          format={{
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 2,
                          }}
                          formatter={(value) => `$${value}`}
                          transformTiming={{
                            duration: 500,
                            easing: "ease-out",
                          }}
                        />
                      </span>
                      <span className="text-gray-500 ml-2">/ {plan.period}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {isMonthly ? "billed monthly" : "billed annually"}
                </p>

                <ul className="mt-6 space-y-4">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-excel shrink-0 mt-0.5" />
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={plan.href}
                className={cn(
                  buttonVariants({ variant: plan.isPopular ? "default" : "outline" }),
                  "mt-6 w-full",
                  plan.isPopular ? "bg-excel hover:bg-excel/90" : ""
                )}
              >
                {plan.buttonText}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
