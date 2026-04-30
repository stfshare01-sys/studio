'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Search, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/types/auth.types';

interface SubjectSelectorProps {
    availableSubjects: User[];
    filteredSubjects: User[];
    selectedSubject: User | undefined;
    requestOnBehalfOf: string;
    open: boolean;
    search: string;
    disabled?: boolean;
    onOpenChange: (open: boolean) => void;
    onSearchChange: (search: string) => void;
    onSelect: (userId: string) => void;
}

export function SubjectSelector({
    availableSubjects, filteredSubjects, selectedSubject,
    requestOnBehalfOf, open, search, disabled,
    onOpenChange, onSearchChange, onSelect,
}: SubjectSelectorProps) {
    if (availableSubjects.length <= 1) return null;

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Solicitar para
            </label>
            <Popover open={open} onOpenChange={onOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                        disabled={disabled}
                    >
                        {selectedSubject ? (
                            <div className="flex items-center gap-2">
                                <UserIcon className="h-4 w-4 opacity-50" />
                                <span>{selectedSubject.fullName}</span>
                                <span className="text-xs text-muted-foreground ml-1">({selectedSubject.email})</span>
                            </div>
                        ) : (
                            'Seleccionar empleado...'
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Buscar empleado..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-1">
                        {filteredSubjects.length === 0 ? (
                            <div className="py-6 text-center text-sm">No se encontraron empleados.</div>
                        ) : (
                            filteredSubjects.map((subject) => (
                                <div
                                    key={subject.id}
                                    className={cn(
                                        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                                        requestOnBehalfOf === subject.id && 'bg-accent text-accent-foreground'
                                    )}
                                    onClick={() => {
                                        onSelect(subject.id);
                                        onOpenChange(false);
                                    }}
                                >
                                    <Check className={cn('mr-2 h-4 w-4', requestOnBehalfOf === subject.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex flex-col">
                                        <span>{subject.fullName}</span>
                                        <span className="text-xs text-muted-foreground">{subject.email}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Puede realizar esta solicitud en nombre de otro empleado.</p>
        </div>
    );
}
