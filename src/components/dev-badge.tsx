"use client";

import React from "react";

export function DevBadge() {
  const isDevelopment = process.env.NODE_ENV === "development" || 
                        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes("dev");

  if (!isDevelopment) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] animate-pulse pointer-events-none">
      <div className="bg-red-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl border-2 border-red-800 flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
        CLON (ENTORNO DE PRUEBAS)
      </div>
    </div>
  );
}
