"use client";

import { useEffect, useState } from "react";
import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DesignStyle = "classic" | "vanguard" | "liquid" | "cyber";

const STYLES: { id: DesignStyle; label: string; icon: string }[] = [
    { id: "classic", label: "Classic (Default)", icon: "🏗️" },
    { id: "vanguard", label: "Vanguardia Humana", icon: "🌱" },
    { id: "liquid", label: "Flow Vidrio Líquido", icon: "💧" },
    { id: "cyber", label: "Cyber-Admin", icon: "🤖" },
];

export function StyleSelector() {
    const [currentStyle, setCurrentStyle] = useState<DesignStyle>("classic");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedStyle = localStorage.getItem("design-style") as DesignStyle | null;
        if (savedStyle) {
            setCurrentStyle(savedStyle);
            applyStyle(savedStyle);
        }
    }, []);

    const applyStyle = (style: DesignStyle) => {
        const root = document.documentElement;
        // Remove all theme classes first
        root.classList.remove("theme-vanguard", "theme-liquid", "theme-cyber");

        // Add the new one if it's not classic
        if (style !== "classic") {
            root.classList.add(`theme-${style}`);
        }
    };

    const handleStyleChange = (style: DesignStyle) => {
        setCurrentStyle(style);
        localStorage.setItem("design-style", style);
        applyStyle(style);
    };

    if (!mounted) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Cambiar estilo de diseño">
                    <Palette className="h-5 w-5" />
                    <span className="sr-only">Cambiar estilo</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Estilo de Interfaz</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STYLES.map((style) => (
                    <DropdownMenuItem
                        key={style.id}
                        onClick={() => handleStyleChange(style.id)}
                        className="flex items-center justify-between"
                    >
                        <div className="flex items-center gap-2">
                            <span>{style.icon}</span>
                            <span>{style.label}</span>
                        </div>
                        {currentStyle === style.id && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
