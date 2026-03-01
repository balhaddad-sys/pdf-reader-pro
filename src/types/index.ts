export interface PDFDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  zoom: number;
  thumbnail?: string;
  tags: string[];
  favorite: boolean;
}

export interface Annotation {
  id: string;
  documentId: string;
  page: number;
  type: AnnotationType;
  color: string;
  createdAt: number;
  updatedAt: number;
  content?: string;
  rects?: DOMRect[];
  points?: Point[];
  position?: Point;
  selectedText?: string;
  shape?: ShapeData;
  imageData?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
}

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'squiggly'
  | 'note'
  | 'freehand'
  | 'shape'
  | 'text'
  | 'signature'
  | 'stamp';

export type ShapeSubType = 'rectangle' | 'circle' | 'arrow' | 'line';

export interface ShapeData {
  type: ShapeSubType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  strokeWidth: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bookmark {
  id: string;
  documentId: string;
  page: number;
  label: string;
  createdAt: number;
}

export interface OutlineItem {
  title: string;
  page: number;
  children: OutlineItem[];
  expanded?: boolean;
}

export interface TabInfo {
  id: string;
  documentId: string;
  name: string;
  page: number;
  zoom: number;
}

export type Theme = 'light' | 'dark' | 'midnight' | 'sepia';
export type SidebarPanel = 'thumbnails' | 'outline' | 'bookmarks' | 'annotations' | null;
export type ViewMode = 'library' | 'reader';
export type LibrarySort = 'recent' | 'name' | 'added' | 'size';
export type LibraryLayout = 'grid' | 'list';
export type AnnotationTool = 'select' | 'highlight' | 'underline' | 'strikethrough' | 'squiggly' | 'note' | 'freehand' | 'eraser' | 'shape' | 'text' | 'signature' | 'stamp' | null;

export interface SearchResult {
  page: number;
  index: number;
  text: string;
}

export interface AppSettings {
  theme: Theme;
  sidebarWidth: number;
  defaultZoom: number;
  scrollMode: 'vertical' | 'horizontal' | 'page';
  showPageLabels: boolean;
  highlightLinks: boolean;
  autoSave: boolean;
}

export interface StampDefinition {
  id: string;
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
}
