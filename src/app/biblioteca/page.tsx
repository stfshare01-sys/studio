'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Upload, Search, Filter, AlertCircle, Loader2, FileText, BookText, ClipboardList, FileBox } from 'lucide-react';
import { useFirestore, useStorage } from '@/firebase';
import { usePermissions } from '@/hooks/use-permissions';
import { getAllOrgDocuments } from '@/modules/documents/documents-queries';
import { deleteOrgDocument } from '@/modules/documents/documents-mutations';
import { DocumentCard } from './components/DocumentCard';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { BibliotecaChat } from './components/BibliotecaChat';
import type { OrgDocument, DocumentCategory } from '@/modules/documents/documents.types';

const TABS: { value: 'all' | DocumentCategory; label: string; icon: any }[] = [
  { value: 'all', label: 'Todos', icon: BookOpen },
  { value: 'policy', label: 'Políticas', icon: BookText },
  { value: 'manual', label: 'Manuales', icon: FileText },
  { value: 'procedure', label: 'Procedimientos', icon: ClipboardList },
  { value: 'form', label: 'Formatos', icon: FileBox },
];

export default function BibliotecaPage() {
  const firestore = useFirestore();
  const storage = useStorage();
  const { canWrite, isAdmin } = usePermissions();
  const canManage = isAdmin || canWrite('org_documents');

  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | DocumentCategory>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docs = await getAllOrgDocuments(firestore);
      setDocuments(docs);
    } catch (err: any) {
      console.error('[Biblioteca] Load error:', err);
      setError('No se pudieron cargar los documentos.');
    } finally {
      setIsLoading(false);
    }
  }, [firestore]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDelete = async (doc: OrgDocument) => {
    if (!confirm(`¿Eliminar el documento "${doc.title}"? Esta acción es irreversible.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteOrgDocument(firestore, storage, doc.id, doc.storagePath);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('[Biblioteca] Delete error:', err);
      alert('Error al eliminar el documento. Inténtalo de nuevo.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUploadSuccess = (newDoc: OrgDocument) => {
    setDocuments(prev => [newDoc, ...prev]);
  };

  // Filter documents
  const filtered = documents.filter(doc => {
    const matchTab = activeTab === 'all' || doc.category === activeTab;
    const matchSearch = !search ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase()) ||
      doc.uploadedByName.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Biblioteca
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Políticas, manuales y documentos organizacionales
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setUploadOpen(true)}
            className="mt-3 sm:mt-0 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-95"
          >
            <Upload className="h-4 w-4" />
            Subir Documento
          </button>
        )}
      </div>

      {/* Search & Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, descripción o autor..."
            className="h-10 w-full rounded-xl border bg-background pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-background p-1">
          {TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all
                ${activeTab === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Cargando documentos...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadDocuments}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Reintentar
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
            <BookOpen className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium">
            {search ? 'No se encontraron documentos con esa búsqueda' : 'No hay documentos en esta categoría'}
          </p>
          {canManage && !search && (
            <button
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Subir primer documento
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'documento' : 'documentos'}
            {search && ` para "${search}"`}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(doc => (
              <div key={doc.id} className={deletingId === doc.id ? 'opacity-40 pointer-events-none' : ''}>
                <DocumentCard
                  document={doc}
                  onDelete={canManage ? handleDelete : undefined}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upload Modal */}
      <DocumentUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <BibliotecaChat />
    </div>
  );
}
