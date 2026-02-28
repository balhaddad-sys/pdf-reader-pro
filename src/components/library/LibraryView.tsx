import { useEffect, useCallback, useRef } from 'react';
import {
  Search, Upload, Grid3X3, List, SortAsc, Plus,
  FileText, Star, Clock, ArrowUpDown,
} from 'lucide-react';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import { DocumentCard } from './DocumentCard';
import { DropZone } from '@/components/common/DropZone';
import { cn } from '@/utils/helpers';
import type { LibrarySort } from '@/types';

const sortOptions: { value: LibrarySort; label: string; icon: typeof Clock }[] = [
  { value: 'recent', label: 'Recently opened', icon: Clock },
  { value: 'name', label: 'Name', icon: SortAsc },
  { value: 'added', label: 'Date added', icon: ArrowUpDown },
  { value: 'size', label: 'File size', icon: ArrowUpDown },
];

export function LibraryView() {
  const documents = useDocumentStore(s => s.documents);
  const loadDocuments = useDocumentStore(s => s.loadDocuments);
  const importFile = useDocumentStore(s => s.importFile);
  const openDocument = useDocumentStore(s => s.openDocument);
  const librarySort = useDocumentStore(s => s.librarySort);
  const setLibrarySort = useDocumentStore(s => s.setLibrarySort);
  const libraryLayout = useDocumentStore(s => s.libraryLayout);
  const setLibraryLayout = useDocumentStore(s => s.setLibraryLayout);
  const librarySearch = useDocumentStore(s => s.librarySearch);
  const setLibrarySearch = useDocumentStore(s => s.setLibrarySearch);
  const setViewMode = useUIStore(s => s.setViewMode);
  const addToast = useUIStore(s => s.addToast);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleImport = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const id = await importFile(file);
          addToast(`Imported "${file.name}"`, 'success');
          if (files.length === 1) {
            await openDocument(id);
            setViewMode('reader');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to import "${file.name}":`, err);
          addToast(`Failed to import "${file.name}": ${msg}`, 'error');
        }
      }
    },
    [importFile, openDocument, setViewMode, addToast],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleImport(files);
    e.target.value = '';
  };

  const handleOpen = async (id: string) => {
    await openDocument(id);
    setViewMode('reader');
  };

  // Filter and sort
  const filtered = documents.filter(d =>
    !librarySearch || d.name.toLowerCase().includes(librarySearch.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (librarySort) {
      case 'recent': return b.lastOpenedAt - a.lastOpenedAt;
      case 'name': return a.name.localeCompare(b.name);
      case 'added': return b.addedAt - a.addedAt;
      case 'size': return b.size - a.size;
      default: return 0;
    }
  });

  const favorites = sorted.filter(d => d.favorite);
  const rest = sorted.filter(d => !d.favorite);

  return (
    <DropZone onDrop={handleImport} fullScreen className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Your Documents</h1>
            <p className="text-sm text-on-surface-secondary mt-1">
              {documents.length} document{documents.length !== 1 ? 's' : ''} in your library
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
              'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
              'shadow-elevation-2 hover:shadow-elevation-3',
            )}
          >
            <Plus size={16} />
            Open PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-secondary" />
            <input
              type="text"
              placeholder="Search documents..."
              value={librarySearch}
              onChange={e => setLibrarySearch(e.target.value)}
              className={cn(
                'w-full h-9 pl-9 pr-3 rounded-xl text-sm bg-surface-2 border border-border',
                'text-on-surface placeholder:text-on-surface-secondary/50',
                'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30',
                'transition-all',
              )}
            />
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Sort dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium text-on-surface-secondary hover:text-on-surface hover:bg-surface-2 transition-all">
                <SortAsc size={14} />
                {sortOptions.find(s => s.value === librarySort)?.label}
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-3 border border-border rounded-xl shadow-elevation-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 py-1">
                {sortOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLibrarySort(opt.value)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                      librarySort === opt.value
                        ? 'text-brand-400 bg-brand-500/10'
                        : 'text-on-surface-secondary hover:text-on-surface hover:bg-white/5',
                    )}
                  >
                    <opt.icon size={14} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout toggle */}
            <div className="flex items-center bg-surface-2 rounded-xl p-0.5">
              <button
                onClick={() => setLibraryLayout('grid')}
                className={cn(
                  'w-8 h-7 rounded-lg flex items-center justify-center transition-all',
                  libraryLayout === 'grid' ? 'bg-surface-3 text-on-surface shadow-sm' : 'text-on-surface-secondary hover:text-on-surface',
                )}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setLibraryLayout('list')}
                className={cn(
                  'w-8 h-7 rounded-lg flex items-center justify-center transition-all',
                  libraryLayout === 'list' ? 'bg-surface-3 text-on-surface shadow-sm' : 'text-on-surface-secondary hover:text-on-surface',
                )}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-surface-2 flex items-center justify-center mb-6">
              <FileText size={32} className="text-on-surface-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-on-surface mb-2">No documents yet</h3>
            <p className="text-sm text-on-surface-secondary mb-6 max-w-sm text-center">
              Drop a PDF file here or click the button above to get started.
              Your documents are stored locally and never leave your device.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-glow"
            >
              <Upload size={16} />
              Import your first PDF
            </button>
          </div>
        )}

        {/* Favorites section */}
        {favorites.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-yellow-400" />
              <h2 className="text-xs font-semibold text-on-surface-secondary uppercase tracking-wider">Favorites</h2>
            </div>
            <div className={cn(
              libraryLayout === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                : 'flex flex-col gap-2',
            )}>
              {favorites.map(doc => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  layout={libraryLayout}
                  onOpen={() => handleOpen(doc.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* All documents */}
        {rest.length > 0 && (
          <div>
            {favorites.length > 0 && (
              <h2 className="text-xs font-semibold text-on-surface-secondary uppercase tracking-wider mb-4">
                All Documents
              </h2>
            )}
            <div className={cn(
              libraryLayout === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                : 'flex flex-col gap-2',
            )}>
              {rest.map(doc => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  layout={libraryLayout}
                  onOpen={() => handleOpen(doc.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {librarySearch && sorted.length === 0 && documents.length > 0 && (
          <div className="flex flex-col items-center py-16">
            <Search size={32} className="text-on-surface-secondary mb-4" />
            <p className="text-sm text-on-surface-secondary">No documents match "{librarySearch}"</p>
          </div>
        )}
      </div>
    </DropZone>
  );
}
