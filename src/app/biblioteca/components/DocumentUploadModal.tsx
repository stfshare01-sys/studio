'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, FileText, AlertCircle, Check } from 'lucide-react';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { uploadOrgDocument } from '@/modules/documents/documents-mutations';
import { getDepartments } from '@/firebase/actions/department-actions';
import type { DocumentCategory, OrgDocument } from '@/modules/documents/documents.types';

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (doc: OrgDocument) => void;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'policy', label: 'Política' },
  { value: 'manual', label: 'Manual' },
  { value: 'procedure', label: 'Procedimiento' },
  { value: 'form', label: 'Formato' },
  { value: 'other', label: 'Otro' },
];

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE_MB = 50;

export function DocumentUploadModal({ open, onClose, onSuccess }: DocumentUploadModalProps) {
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('policy');
  const [file, setFile] = useState<File | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Upload state
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load departments on mount
  useEffect(() => {
    if (!open) return;
    getDepartments(true).then(res => {
      if (res.success && res.departments) {
        setDepartments(res.departments.map(d => ({ id: d.id, name: d.name })));
      }
    });
  }, [open]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setCategory('policy');
    setFile(null);
    setSelectedDepts([]);
    setProgress(0);
    setError(null);
    setIsUploading(false);
  }, []);

  const handleClose = () => {
    if (isUploading) return;
    resetForm();
    onClose();
  };

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      return 'Solo se aceptan archivos PDF o Word (.doc, .docx)';
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `El archivo supera el límite de ${MAX_SIZE_MB} MB`;
    }
    return null;
  };

  const handleFileChange = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setFile(f);
    // Auto-fill title if empty
    if (!title) {
      const nameWithoutExt = f.name.replace(/\.(pdf|docx?)/i, '').replace(/[_-]/g, ' ');
      setTitle(nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  };

  const toggleDepartment = (deptId: string) => {
    setSelectedDepts(prev =>
      prev.includes(deptId) ? prev.filter(d => d !== deptId) : [...prev, deptId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;
    if (!title.trim()) { setError('El título es requerido'); return; }

    setIsUploading(true);
    setError(null);

    try {
      const fileType = file.type === 'application/pdf' ? 'pdf' : 'word';
      const newDoc = await uploadOrgDocument(
        firestore,
        storage,
        file,
        {
          title: title.trim(),
          description: description.trim(),
          category,
          fileType,
          visibleToDepartments: selectedDepts,
          visibleToUserIds: [],
          uploadedByUid: user.uid,
          uploadedByName: user.displayName || user.email || 'Usuario',
        },
        (pct) => setProgress(pct)
      );
      onSuccess(newDoc);
      resetForm();
      onClose();
    } catch (err: any) {
      console.error('[Biblioteca] Upload error:', err);
      setError(err?.message || 'Error al subir el archivo. Inténtalo de nuevo.');
      setIsUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Subir Documento</h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          {/* Drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}
              ${file ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />
            {file ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400 truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Arrastra un archivo o haz clic aquí</p>
                  <p className="text-xs text-muted-foreground">PDF o Word — máximo {MAX_SIZE_MB} MB</p>
                </div>
              </>
            )}
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Título <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre del documento"
              required
              className="h-9 rounded-lg border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripción del contenido..."
              rows={2}
              className="resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors
                    ${category === c.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent text-muted-foreground hover:text-foreground'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Departments */}
          {departments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Visible para departamentos
                <span className="ml-1 text-xs text-muted-foreground font-normal">(dejar vacío = toda la empresa)</span>
              </label>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-lg border bg-background p-2">
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDepartment(dept.name)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors
                      ${selectedDepts.includes(dept.name)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent text-muted-foreground hover:text-foreground'}`}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Progress */}
          {isUploading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Subiendo archivo...
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading ? 'Subiendo...' : 'Subir Documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
