"use client";

import { useEffect } from "react";

interface ModalProps {
  show: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl"; // ✅ add "xl"
}



/**
 * Simple reusable modal for KIDOOZA
 * - Closes on ESC
 * - Clicks outside the box also close
 * - Smooth fade animation
 */
export default function Modal({
  show,
  onClose,
  title,
  children,
  size = "md", // ✅ default to medium if not passed
}: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!show) return null;

  const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl", // ✅ Tailwind-supported size
};



  return (
    <div
      className="fixed inset-0 z-9998 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl ${sizeClasses[size]} w-full p-6 m-4 text-center animate-fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-xl font-semibold mb-3">{title}</h2>}
        <div className="text-gray-700">{children}</div>
        <button
          onClick={onClose}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
