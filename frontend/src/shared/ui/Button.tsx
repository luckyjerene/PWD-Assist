import React, { ButtonHTMLAttributes, forwardRef, useRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', isLoading, className = '', onClick, ...props }, ref) => {
    const localRef = useRef<HTMLButtonElement>(null);
    const combinedRef = (ref || localRef) as React.MutableRefObject<HTMLButtonElement>;

    // Material Ripple Effect
    const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = combinedRef.current;
      if (!button) return;

      const circle = document.createElement('span');
      const diameter = Math.max(button.clientWidth, button.clientHeight);
      const radius = diameter / 2;

      const rect = button.getBoundingClientRect();
      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${event.clientX - rect.left - radius}px`;
      circle.style.top = `${event.clientY - rect.top - radius}px`;
      circle.classList.add('ripple');

      const existingRipple = button.querySelector('.ripple');
      if (existingRipple) existingRipple.remove();

      button.appendChild(circle);
      if (onClick) onClick(event);
    };

    // WCAG AAA: Min 48px touch targets handled via CSS classes
    const baseClass = "inline-flex items-center justify-center font-bold rounded-lg transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--gov-gold)] relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed";
    
    const sizeClasses = {
      sm: "min-h-[48px] min-w-[48px] px-4 text-sm",
      md: "min-h-[48px] min-w-[48px] px-6 text-base",
      lg: "min-h-[56px] min-w-[56px] px-8 text-lg"
    };

    const variantClasses = {
      primary: "bg-[#0032A0] text-white hover:bg-[#001B5E]",
      secondary: "bg-[#FEDB41] text-black hover:bg-[#C9A700]",
      destructive: "bg-[#DC2626] text-white hover:bg-[#991B1B]",
      ghost: "bg-transparent text-[#0032A0] border-2 border-[#0032A0] hover:bg-[#E6EDF8]"
    };

    return (
      <button
        ref={combinedRef}
        onClick={createRipple}
        className={`${baseClass} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="animate-spin mr-2">⏳</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
