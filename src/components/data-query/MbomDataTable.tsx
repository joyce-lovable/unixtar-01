import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Trash2, Download, Search, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, Circle, RotateCcw, Filter } from 'lucide-react';
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
  group_id: number | null;
}

interface GroupInfo {
  group_id: number;
  customer_part_name: string;
  downloaded: boolean;
}

const PAGE_SIZE = 50;

const MbomDataTable = () => {
  const [records, setRecords] = useState<MbomRecord[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 解析群組篩選 (如 "1-10" 或 "1,3,5")
  const parseGroupFilter = useCallback((filter: string): number[] | null => {
    if (!filter.trim()) return null;
    
    const result: number[] = [];
    const parts = filter.split(',').map(p => p.trim());
    
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (!result.includes(i)) result.push(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num) && !result.includes(num)) {
          result.push(num);
        }
      }
    }
    
    return result.length > 0 ? result : null;
  }, []);

  const fetchGroups = async () => {
    const { data, error } = await supabase
      .from('mbom_groups')
      .select('group_id, customer_part_name, downloaded')
      .order('group_id');
    
    if (error) {
      console.error('Error fetching groups:', error);
      return;
    }
    
    setGroups(data || []);
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('mbom_results')
        .select('*', { count: 'exact' })
        .order('group_id', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true });

      if (searchTerm) {
        query = query.or(`customer_part_name.ilike.%${searchTerm}%,main_part_number.ilike.%${searchTerm}%,component_part_number.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%`);
      }

      // 群組篩選
      const groupIds = parseGroupFilter(groupFilter);
      if (groupIds && groupIds.length > 0) {
        query = query.in('group_id', groupIds);
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
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [currentPage, searchTerm, groupFilter]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleGroupFilter = (value: string) => {
    setGroupFilter(value);
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

  // 選取整組資料
  const handleSelectGroup = (groupId: number) => {
    const groupRecordIds = records.filter(r => r.group_id === groupId).map(r => r.id);
    const allSelected = groupRecordIds.every(id => selectedIds.has(id));
    
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      groupRecordIds.forEach(id => newSelected.delete(id));
    } else {
      groupRecordIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      toast.warning('請先選擇要刪除的資料');
      return;
    }

    try {
      // 取得要刪除的記錄以便檢查是否需要刪除群組
      const recordsToDelete = records.filter(r => selectedIds.has(r.id));
      const groupIdsToCheck = [...new Set(recordsToDelete.map(r => r.group_id).filter(Boolean))] as number[];

      const { error } = await supabase
        .from('mbom_results')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      // 檢查每個群組是否還有剩餘資料，如果沒有則刪除群組
      for (const gid of groupIdsToCheck) {
        const { count } = await supabase
          .from('mbom_results')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', gid);
        
        if (count === 0) {
          await supabase.from('mbom_groups').delete().eq('group_id', gid);
        }
      }

      toast.success(`已刪除 ${selectedIds.size} 筆資料`);
      setSelectedIds(new Set());
      fetchRecords();
      fetchGroups();
    } catch (error) {
      console.error('Error deleting records:', error);
      toast.error('刪除失敗');
    }
  };

  // 標記選取的群組為已下載
  const markGroupsAsDownloaded = async (groupIds: number[]) => {
    if (groupIds.length === 0) return;
    
    const { error } = await supabase
      .from('mbom_groups')
      .update({ downloaded: true })
      .in('group_id', groupIds);
    
    if (error) {
      console.error('Error marking groups as downloaded:', error);
    } else {
      fetchGroups();
    }
  };

  // 匯出 Excel 的共用函數
  const exportToExcel = (data: MbomRecord[]) => {
    if (data.length === 0) {
      toast.warning('沒有可匯出的資料');
      return;
    }

    const wsData = data.map(r => ({
      '組號': r.group_id || '-',
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
    
    toast.success(`已匯出 ${data.length} 筆資料`);
  };

  const handleExport = async () => {
    // 如果有選取資料，取得選取資料涉及的所有 group_id，並查詢完整組資料
    if (selectedIds.size > 0) {
      const selectedRecords = records.filter(r => selectedIds.has(r.id));
      const groupIdsToExport = [...new Set(selectedRecords.map(r => r.group_id).filter(Boolean))] as number[];
      
      if (groupIdsToExport.length > 0) {
        // 查詢這些組的完整資料（不受分頁限制）
        const { data: fullData, error } = await supabase
          .from('mbom_results')
          .select('*')
          .in('group_id', groupIdsToExport)
          .order('group_id', { ascending: true })
          .order('sort_order', { ascending: true });
        
        if (error) {
          console.error('Error fetching full group data:', error);
          toast.error('匯出失敗');
          return;
        }
        
        exportToExcel(fullData || []);
        await markGroupsAsDownloaded(groupIdsToExport);
        fetchGroups();
        return;
      }
    }
    
    // 如果沒有選取，則匯出當前頁面資料
    exportToExcel(records);
  };

  // 清空所有下載記錄
  const handleClearDownloadHistory = async () => {
    const { error } = await supabase
      .from('mbom_groups')
      .update({ downloaded: false })
      .neq('group_id', 0); // 更新所有記錄

    if (error) {
      console.error('Error clearing download history:', error);
      toast.error('清空下載記錄失敗');
    } else {
      toast.success('已清空所有下載記錄');
      fetchGroups();
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));

  // 取得群組下載狀態
  const getGroupDownloaded = (groupId: number | null): boolean => {
    if (!groupId) return false;
    const group = groups.find(g => g.group_id === groupId);
    return group?.downloaded || false;
  };

  // 檢查群組是否全選
  const isGroupAllSelected = (groupId: number): boolean => {
    const groupRecordIds = records.filter(r => r.group_id === groupId).map(r => r.id);
    return groupRecordIds.length > 0 && groupRecordIds.every(id => selectedIds.has(id));
  };

  // 取得唯一的群組列表（當前頁面）
  const uniqueGroupIds = [...new Set(records.map(r => r.group_id).filter(Boolean))] as number[];

  // 計算選取的記錄涉及多少組
  const selectedGroupIds = [...new Set(
    records.filter(r => selectedIds.has(r.id)).map(r => r.group_id).filter(Boolean)
  )] as number[];

  // 計算下載和未下載的群組數量
  const downloadedGroupCount = groups.filter(g => g.downloaded).length;
  const totalGroupCount = groups.length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>共 {totalGroupCount} 組</span>
        <span className="text-emerald-600">已下載 {downloadedGroupCount} 組</span>
        <span>未下載 {totalGroupCount - downloadedGroupCount} 組</span>
      </div>

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
        <div className="relative min-w-[120px] max-w-[180px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="組號 (如 1-10)"
            value={groupFilter}
            onChange={(e) => handleGroupFilter(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchRecords(); fetchGroups(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          重新整理
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
          <Download className="w-4 h-4 mr-2" />
          匯出 Excel {selectedGroupIds.length > 0 && `(${selectedGroupIds.length} 組)`}
        </Button>
        <Button variant="outline" size="sm" onClick={handleClearDownloadHistory} className="text-amber-600 border-amber-300 hover:bg-amber-50">
          <RotateCcw className="w-4 h-4 mr-2" />
          清空下載記錄
        </Button>
        <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={selectedIds.size === 0}>
          <Trash2 className="w-4 h-4 mr-2" />
          刪除 {selectedIds.size > 0 && `(${selectedIds.size})`}
        </Button>
      </div>

      {/* Group quick select */}
      {uniqueGroupIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">快速選取組：</span>
          {uniqueGroupIds.map(gid => (
            <Badge 
              key={gid} 
              variant={isGroupAllSelected(gid) ? "default" : "outline"}
              className={`cursor-pointer transition-colors ${
                getGroupDownloaded(gid) 
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200' 
                  : ''
              }`}
              onClick={() => handleSelectGroup(gid)}
            >
              {getGroupDownloaded(gid) && <CheckCircle2 className="w-3 h-3 mr-1" />}
              組 {gid}
            </Badge>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table className="min-w-[1500px]">
          <TableHeader>
            <TableRow className="bg-emerald-50 dark:bg-emerald-950/30">
              <TableHead className="w-12">
                <Checkbox 
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-20 whitespace-nowrap">組號</TableHead>
              <TableHead className="w-12 whitespace-nowrap">狀態</TableHead>
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
                <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                  載入中...
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                  {searchTerm || groupFilter ? '找不到符合的資料' : '尚無資料'}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record, index) => {
                const downloaded = getGroupDownloaded(record.group_id);
                return (
                  <TableRow 
                    key={record.id}
                    className={`${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'} ${downloaded ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(record.id)}
                        onCheckedChange={(checked) => handleSelectOne(record.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      {record.group_id ? (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => record.group_id && handleSelectGroup(record.group_id)}
                        >
                          {record.group_id}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {downloaded ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/40" />
                      )}
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
                );
              })
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