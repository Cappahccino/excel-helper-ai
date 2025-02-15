
import { cn } from "@/lib/utils";
import {
  LoaderCircleIcon,
  LoaderIcon,
  LoaderPinwheelIcon,
  type LucideProps,
} from "lucide-react";

type SpinnerVariantProps = Omit<SpinnerProps, "variant">;

const Default = ({ className, ...props }: SpinnerVariantProps) => (
  <LoaderIcon className={cn("animate-spin", className)} {...props} />
);

const Circle = ({ className, ...props }: SpinnerVariantProps) => (
  <LoaderCircleIcon className={cn("animate-spin", className)} {...props} />
);

const Pinwheel = ({ className, ...props }: SpinnerVariantProps) => (
  <LoaderPinwheelIcon className={cn("animate-spin", className)} {...props} />
);

const CircleFilled = ({
  className,
  size = 24,
  ...props
}: SpinnerVariantProps) => (
  <div className="relative" style={{ width: size, height: size }}>
    <div className="absolute inset-0 rotate-180">
      <LoaderCircleIcon
        className={cn("animate-spin", className, "text-foreground opacity-20")}
        size={size}
        {...props}
      />
    </div>
    <LoaderCircleIcon
      className={cn("relative animate-spin", className)}
      size={size}
      {...props}
    />
  </div>
);

const Ring = ({ size = 24, ...props }: SpinnerVariantProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 44 44"
    stroke="currentColor"
    {...props}
  >
    <title>Loading...</title>
    <g fill="none" fillRule="evenodd" strokeWidth="2">
      <circle cx="22" cy="22" r="1">
        <animate
          attributeName="r"
          begin="0s"
          dur="1.8s"
          values="1; 20"
          calcMode="spline"
          keyTimes="0; 1"
          keySplines="0.165, 0.84, 0.44, 1"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-opacity"
          begin="0s"
          dur="1.8s"
          values="1; 0"
          calcMode="spline"
          keyTimes="0; 1"
          keySplines="0.3, 0.61, 0.355, 1"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="22" cy="22" r="1">
        <animate
          attributeName="r"
          begin="-0.9s"
          dur="1.8s"
          values="1; 20"
          calcMode="spline"
          keyTimes="0; 1"
          keySplines="0.165, 0.84, 0.44, 1"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-opacity"
          begin="-0.9s"
          dur="1.8s"
          values="1; 0"
          calcMode="spline"
          keyTimes="0; 1"
          keySplines="0.3, 0.61, 0.355, 1"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  </svg>
);

export type SpinnerProps = LucideProps & {
  variant?: "default" | "circle" | "pinwheel" | "circle-filled" | "ring";
};

export const Spinner = ({ variant, ...props }: SpinnerProps) => {
  switch (variant) {
    case "circle":
      return <Circle {...props} />;
    case "pinwheel":
      return <Pinwheel {...props} />;
    case "circle-filled":
      return <CircleFilled {...props} />;
    case "ring":
      return <Ring {...props} />;
    default:
      return <Default {...props} />;
  }
};
