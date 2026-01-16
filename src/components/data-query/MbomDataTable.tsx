import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Download, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface MbomRecord {
  id: string;
  file_name: string;
  customer_part_name: string;
  main_part_number: string;
  component_part_number: string;
  cad_sequence: number;
  quantity: number;
  unit: string;
  material_category: string;
  source: string;
  created_at: string;
  remark: string | null;
  production_process: string;
  has_substitute: string;
  material_quality: string;
}

const PAGE_SIZE = 50;

const MbomDataTable = () => {
  const [records, setRecords] = useState<MbomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      // 使用 RPC 或自訂排序：先按客戶料號品名，再按 source 順序（txt -> mold -> sub），最後按 CAD 項次
      let query = supabase
        .from('mbom_results')
        .select('*', { count: 'exact' })
        .order('customer_part_name', { ascending: true })
        .order('main_part_number', { ascending: true })
        .order('cad_sequence', { ascending: true });

      if (searchTerm) {
        query = query.or(`customer_part_name.ilike.%${searchTerm}%,main_part_number.ilike.%${searchTerm}%,component_part_number.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%`);
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      setRecords(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching MBOM records:', error);
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
        .from('mbom_results')
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
      '客戶料號品名': r.customer_part_name,
      '主件料號': r.main_part_number,
      '元件料號': r.component_part_number,
      'CAD項次': r.cad_sequence,
      '用量': r.quantity,
      '單位': r.unit,
      '用料類別': r.material_category,
      '生產製程': r.production_process,
      '用料品質': r.material_quality,
      '有無替代料': r.has_substitute,
      '備註': r.remark || '',
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MBOM資料');
    XLSX.writeFile(wb, `MBOM資料_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('匯出成功');
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'txt': return 'TXT';
      case 'mold': return '模具';
      default: return source;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜尋客戶料號品名、主件料號、元件料號..."
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
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table className="min-w-[1400px]">
          <TableHeader>
            <TableRow className="bg-emerald-50 dark:bg-emerald-950/30">
              <TableHead className="w-12">
                <Checkbox 
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="min-w-[200px] whitespace-nowrap">客戶料號品名</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">主件料號</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">元件料號</TableHead>
              <TableHead className="w-20 whitespace-nowrap">CAD項次</TableHead>
              <TableHead className="w-16 whitespace-nowrap">用量</TableHead>
              <TableHead className="w-14 whitespace-nowrap">單位</TableHead>
              <TableHead className="w-24 whitespace-nowrap">用料類別</TableHead>
              <TableHead className="w-24 whitespace-nowrap">生產製程</TableHead>
              <TableHead className="w-24 whitespace-nowrap">用料品質</TableHead>
              <TableHead className="w-28 whitespace-nowrap">有無替代料</TableHead>
              <TableHead className="min-w-[120px]">備註</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  載入中...
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
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
                  <TableCell className="font-medium whitespace-nowrap">{record.customer_part_name}</TableCell>
                  <TableCell className="font-mono text-sm whitespace-nowrap">{record.main_part_number}</TableCell>
                  <TableCell className="font-mono text-sm whitespace-nowrap">{record.component_part_number}</TableCell>
                  <TableCell>{record.cad_sequence}</TableCell>
                  <TableCell>{record.quantity}</TableCell>
                  <TableCell>{record.unit}</TableCell>
                  <TableCell>{record.material_category}</TableCell>
                  <TableCell>{record.production_process}</TableCell>
                  <TableCell>{record.material_quality}</TableCell>
                  <TableCell>{record.has_substitute}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{record.remark || '-'}</TableCell>
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

export default MbomDataTable;
