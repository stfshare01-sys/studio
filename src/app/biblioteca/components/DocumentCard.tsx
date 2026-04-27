'use client';

import { FileText, FileDown, Trash2, Eye, Building2, User, Calendar } from 'lucide-react';
import type { OrgDocument, DocumentCategory } from '@/modules/documents/documents.types';
import { usePermissions } from '@/hooks/use-permissions';

interface DocumentCardProps {
  document: OrgDocument;
  onDelete?: (doc: OrgDocument) => void;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  policy: 'Política',
  manual: 'Manual',
  procedure: 'Procedimiento',
  form: 'Formato',
  other: 'Otro',
};

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  policy: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  manual: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  procedure: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  form: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCard({ document: doc, onDelete }: DocumentCardProps) {
  const { isAdmin, canWrite } = usePermissions();
  const canManage = isAdmin || canWrite('org_documents');
  const isPDF = doc.fileType === 'pdf';

  const handleOpen = () => {
    if (isPDF) {
      // PDF: previsualización en nueva pestaña
      window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Word: descarga directa
      const link = window.document.createElement('a');
      link.href = doc.downloadUrl;
      link.download = doc.fileName;
      link.rel = 'noopener noreferrer';
      link.click();
    }
  };

  const isRestricted = doc.visibleToDepartments.length > 0 || doc.visibleToUserIds.length > 0;

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isPDF ? 'bg-red-100 dark:bg-red-900/30' : 'bg-sky-100 dark:bg-sky-900/30'}`}>
            <FileText className={`h-5 w-5 ${isPDF ? 'text-red-600 dark:text-red-400' : 'text-sky-600 dark:text-sky-400'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-sm leading-tight" title={doc.title}>
              {doc.title}
            </h3>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[doc.category]}`}>
              {CATEGORY_LABELS[doc.category]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1">
          <button
            onClick={handleOpen}
            title={isPDF ? 'Ver documento' : 'Descargar'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isPDF ? <Eye className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
          </button>
          {canManage && onDelete && (
            <button
              onClick={() => onDelete(doc)}
              title="Eliminar documento"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {doc.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
      )}

      {/* Footer metadata */}
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {doc.uploadedAt}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {doc.uploadedByName}
        </span>
        {isRestricted && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Building2 className="h-3 w-3" />
            Acceso restringido
          </span>
        )}
        <span className="ml-auto">{formatBytes(doc.fileSizeBytes)}</span>
      </div>
    </div>
  );
}
