"use client";

import React from "react";

export function DevBadge() {
  const isDevelopment = process.env.NODE_ENV === "development" || 
                        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes("dev");

  if (!isDevelopment) return null;

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
      <div className="bg-red-600 text-white px-6 py-1.5 rounded-b-lg font-bold text-xs sm:text-sm shadow-xl flex items-center gap-2 tracking-wider">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        CLON (ENTORNO DE PRUEBAS)
      </div>
    </div>
  );
}
