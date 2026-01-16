import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Download, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SopRecord {
  id: string;
  file_name: string | null;
  part_number: string;
  process_code: number;
  process_name: string;
  operation: string;
  sequence: string;
  created_at: string;
}

const PAGE_SIZE = 20;

const SopDataTable = () => {
  const [records, setRecords] = useState<SopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sop_ocr_results')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`part_number.ilike.%${searchTerm}%,process_name.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%`);
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      setRecords(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching SOP records:', error);
      toast.error('載入資料失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [currentPage, searchTerm]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(records.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      toast.warning('請先選擇要刪除的資料');
      return;
    }

    try {
      const { error } = await supabase
        .from('sop_ocr_results')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`已刪除 ${selectedIds.size} 筆資料`);
      setSelectedIds(new Set());
      fetchRecords();
    } catch (error) {
      console.error('Error deleting records:', error);
      toast.error('刪除失敗');
    }
  };

  const handleExport = () => {
    const dataToExport = selectedIds.size > 0
      ? records.filter(r => selectedIds.has(r.id))
      : records;

    if (dataToExport.length === 0) {
      toast.warning('沒有可匯出的資料');
      return;
    }

    const wsData = dataToExport.map(r => ({
      '檔案名稱': r.file_name || '',
      '料號': r.part_number,
      '製程代碼': r.process_code,
      '製程名稱': r.process_name,
      '作業': r.operation,
      '順序': r.sequence,
      '建立時間': new Date(r.created_at).toLocaleString('zh-TW'),
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SOP製程資料');
    XLSX.writeFile(wb, `SOP製程資料_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('匯出成功');
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜尋料號、製程名稱、檔案名稱..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchRecords()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          重新整理
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
          <Download className="w-4 h-4 mr-2" />
          匯出 Excel {selectedIds.size > 0 && `(${selectedIds.size})`}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={selectedIds.size === 0}>
          <Trash2 className="w-4 h-4 mr-2" />
          刪除 {selectedIds.size > 0 && `(${selectedIds.size})`}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-amber-50 dark:bg-amber-950/30">
              <TableHead className="w-12">
                <Checkbox 
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>檔案名稱</TableHead>
              <TableHead>料號</TableHead>
              <TableHead className="w-24">製程代碼</TableHead>
              <TableHead>製程名稱</TableHead>
              <TableHead>作業</TableHead>
              <TableHead className="w-20">順序</TableHead>
              <TableHead className="w-40">建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  載入中...
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? '找不到符合的資料' : '尚無資料'}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record, index) => (
                <TableRow 
                  key={record.id}
                  className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(record.id)}
                      onCheckedChange={(checked) => handleSelectOne(record.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{record.file_name || '-'}</TableCell>
                  <TableCell className="font-mono">{record.part_number}</TableCell>
                  <TableCell>{record.process_code}</TableCell>
                  <TableCell>{record.process_name}</TableCell>
                  <TableCell>{record.operation}</TableCell>
                  <TableCell>{record.sequence}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(record.created_at).toLocaleString('zh-TW')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {totalCount} 筆資料，第 {currentPage} / {totalPages} 頁
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              上一頁
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              下一頁
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SopDataTable;
