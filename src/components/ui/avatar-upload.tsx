import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';

interface AvatarUploadProps {
    value?: File | null;
    onChange?: (file: File | null) => void;
}

export function AvatarUpload({ value, onChange }: AvatarUploadProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onChange?.(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            onChange?.(null);
            setPreviewUrl(null);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative group cursor-pointer">
                <Avatar className="h-24 w-24 border-2">
                    {previewUrl ? (
                        <AvatarImage src={previewUrl} alt="Vista previa" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-muted-foreground flex flex-col items-center justify-center">
                        <Camera className="h-8 w-8 mb-1" />
                    </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                </div>
                <Input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                />
            </div>
            <p className="text-xs text-muted-foreground">Sube una foto de perfil (Opcional)</p>
        </div>
    );
}
