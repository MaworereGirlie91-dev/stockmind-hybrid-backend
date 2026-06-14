export type BookStatus = 'in_stock' | 'checked_out' | 'lost' | 'sold';

export interface BookMaster {
  id: string;
  title: string;
  isbn: string | null;
  category: string | null;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  list_price?: number | null;
  created_at?: string;
}

export interface BookCopy {
  id: string;
  book_id: string;
  epc_tag: string;
  location: string | null;
  location_type: 'warehouse' | 'stock_room' | 'shelf' | null;
  location_name: string | null;
  status: BookStatus;
  date_added: string;
  updated_at: string;
  books_master?: BookMaster;
}

export interface BookCopyWithMaster extends BookCopy {
  books_master: BookMaster;
}

export interface BookBox {
  id: string;
  book_id: string;
  epc_tag: string;
  quantity: number;
  location: string | null;
  location_type: 'warehouse' | 'stock_room' | 'shelf' | null;
  location_name: string | null;
  created_at: string;
  updated_at: string;
  books_master?: BookMaster;
}

export interface BookBoxWithMaster extends BookBox {
  books_master: BookMaster;
}

export interface DashboardStats {
  total_books: number;
  total_boxes: number;
  books_in_boxes: number;
  books_outside_boxes: number;
  total_sales: number;
  total_books_lost: number;
}

export interface Sale {
  id: string;
  copy_id: string | null;
  book_id: string | null;
  epc_tag: string;
  title: string;
  isbn: string | null;
  category: string | null;
  location: string | null;
  location_type: 'warehouse' | 'stock_room' | 'shelf' | null;
  location_name: string | null;
  price_paid: number;
  sold_at: string;
  notes: string | null;
}

export interface CategoryRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  usage_count: number;
}

export interface LocationRecord {
  id: string;
  location_type: 'warehouse' | 'stock_room' | 'shelf';
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  usage_count: number;
}

export interface InventoryListRow {
  id: string;
  book_id: string;
  epc_tag: string;
  location: string | null;
  location_type: 'warehouse' | 'stock_room' | 'shelf' | null;
  location_name: string | null;
  status: BookStatus;
  date_added: string;
  updated_at: string;
  row_version: number;
  book: BookMaster | null;
}

export interface InventoryBoxListRow {
  id: string;
  book_id: string;
  epc_tag: string;
  quantity: number;
  location: string | null;
  location_type: 'warehouse' | 'stock_room' | 'shelf' | null;
  location_name: string | null;
  created_at: string;
  updated_at: string;
  row_version: number;
  book: BookMaster | null;
}

export interface InventoryFilters {
  q: string;
  status: 'all' | 'in_stock' | 'checked_out' | 'lost';
  category: string;
  location: string;
  page: number;
  page_size: number;
}

export interface CsvTitleCandidate {
  title: string;
  isbn: string;
  category: string;
  author: string;
  publisher: string;
  edition: string;
  list_price: string;
  location: string;
}

export interface CsvImportRow {
  epc_tag: string;
  title: string;
  isbn: string;
  category: string;
  author: string;
  publisher: string;
  edition: string;
  list_price: string;
  quantity: string;
  location: string;
}

// Bridge type for Android -> WebView RFID injection
declare global {
  interface Window {
    onRFIDScan: (epc: string) => void;
  }
}
