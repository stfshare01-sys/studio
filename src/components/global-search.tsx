
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, User, FolderKanban, FileText } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useFirestore, useUser } from "@/firebase";
import { collection, query, where, getDocs, limit, collectionGroup } from "firebase/firestore";
import type { User as UserType } from '@/types/auth.types';
import Link from "next/link";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import type { Template, Request } from "@/types/workflow.types";

type SearchResult = {
    type: 'user' | 'template' | 'request';
    id: string;
    title: string;
    description: string;
    link: string;
    avatarUrl?: string;
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const { user } = useUser();
  const isAdmin = user?.role === 'Admin';

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const firestore = useFirestore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const performSearch = useCallback(async (term: string) => {
    if (!term || !firestore) {
      setResults([]);
      return;
    }
    setIsLoading(true);

    const upperTerm = term.charAt(0).toUpperCase() + term.slice(1);
    
    // Create promises for each collection search
    const usersPromise = getDocs(query(
        collection(firestore, 'users'), 
        where('fullName', '>=', upperTerm),
        where('fullName', '<=', upperTerm + '\uf8ff'),
        limit(5)
    ));
    
    const templatesPromise = getDocs(query(
        collection(firestore, 'request_templates'), 
        where('name', '>=', upperTerm),
        where('name', '<=', upperTerm + '\uf8ff'),
        limit(5)
    ));

    const requestsPromise = isAdmin 
      ? getDocs(query(
          collectionGroup(firestore, 'requests'), 
          where('title', '>=', upperTerm),
          where('title', '<=', upperTerm + '\uf8ff'),
          limit(5)
        ))
      : Promise.resolve(null); // Non-admins won't search requests globally
    
    try {
        const [usersSnapshot, templatesSnapshot, requestsSnapshot] = await Promise.all([usersPromise, templatesPromise, requestsPromise]);
        
        const newResults: SearchResult[] = [];

        usersSnapshot.forEach(doc => {
            const data = doc.data() as UserType;
            newResults.push({
                type: 'user',
                id: doc.id,
                title: data.fullName,
                description: `Usuario - ${data.department}`,
                link: `/admin/users`, // Link to the user management page
                avatarUrl: data.avatarUrl,
            });
        });

        templatesSnapshot.forEach(doc => {
            const data = doc.data() as Template;
            newResults.push({
                type: 'template',
                id: doc.id,
                title: data.name,
                description: `Plantilla - ${data.steps.length} pasos`,
                link: `/templates/edit/${doc.id}`
            });
        });

        requestsSnapshot?.forEach(doc => {
            const data = doc.data() as Request;
            newResults.push({
                type: 'request',
                id: doc.id,
                title: data.title,
                description: `Solicitud - Estado: ${data.status}`,
                link: `/requests/${doc.id}`
            });
        });

        setResults(newResults);
    } catch (error) {
        console.error("Global search failed:", error);
        setResults([]);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, isAdmin]);


  useEffect(() => {
    if (debouncedSearchTerm) {
      performSearch(debouncedSearchTerm);
    } else {
      setResults([]);
    }
  }, [debouncedSearchTerm, performSearch]);

  const resultGroups = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-9 p-0 md:w-auto md:px-3 md:justify-start md:gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline text-muted-foreground text-sm">Buscar...</span>
        <kbd className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl p-0">
          <DialogHeader className="p-4 pb-0">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar solicitudes, usuarios, plantillas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
                {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="p-4 pt-2">
                {results.length === 0 && !isLoading && searchTerm && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                        No se encontraron resultados para "{searchTerm}".
                    </div>
                )}
                 {results.length === 0 && !isLoading && !searchTerm && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                        Empiece a escribir para buscar.
                    </div>
                )}
                <div className="space-y-4">
                    {Object.entries(resultGroups).map(([type, items]) => (
                        <div key={type}>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground px-2 mb-2">
                                {type === 'user' ? 'Usuarios' : type === 'template' ? 'Plantillas' : 'Solicitudes'}
                            </h3>
                            <ul className="space-y-1">
                                {items.map(item => (
                                    <li key={item.id}>
                                        <Link href={item.link} onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted-foreground/10">
                                                {item.type === 'user' ? (
                                                    <Avatar className="h-full w-full">
                                                        <AvatarImage src={item.avatarUrl} />
                                                        <AvatarFallback>{item.title.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                ) : item.type === 'template' ? (
                                                    <FolderKanban className="h-5 w-5 text-muted-foreground" />
                                                ) : (
                                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">{item.title}</p>
                                                <p className="text-xs text-muted-foreground">{item.description}</p>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
