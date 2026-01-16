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

interface SopRecord {
  id: string;
  file_name: string | null;
  part_number: string;
  process_code: number;
  process_name: string;
  operation: string;
  sequence: string;
  created_at: string;
  group_id: number | null;
}

interface GroupInfo {
  group_id: number;
  part_number: string;
  downloaded: boolean;
}

const PAGE_SIZE = 50;

const SopDataTable = () => {
  const [records, setRecords] = useState<SopRecord[]>([]);
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
      .from('sop_groups')
      .select('group_id, part_number, downloaded')
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
        .from('sop_ocr_results')
        .select('*', { count: 'exact' })
        .order('group_id', { ascending: true, nullsFirst: false })
        .order('operation', { ascending: true });

      if (searchTerm) {
        query = query.or(`part_number.ilike.%${searchTerm}%,process_name.ilike.%${searchTerm}%,operation.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%`);
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
      console.error('Error fetching SOP records:', error);
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
        .from('sop_ocr_results')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      // 檢查每個群組是否還有剩餘資料，如果沒有則刪除群組
      for (const gid of groupIdsToCheck) {
        const { count } = await supabase
          .from('sop_ocr_results')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', gid);
        
        if (count === 0) {
          await supabase.from('sop_groups').delete().eq('group_id', gid);
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
      .from('sop_groups')
      .update({ downloaded: true })
      .in('group_id', groupIds);
    
    if (error) {
      console.error('Error marking groups as downloaded:', error);
    } else {
      fetchGroups();
    }
  };

  // 匯出 Excel 的共用函數
  const exportToExcel = (data: SopRecord[]) => {
    if (data.length === 0) {
      toast.warning('沒有可匯出的資料');
      return;
    }

    const wsData = data.map(r => ({
      '組號': r.group_id || '-',
      '料號': r.part_number,
      '工序': r.operation,
      '序號': r.sequence,
      '製程編碼': r.process_code,
      '製程名稱': r.process_name,
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SOP製程編碼');
    XLSX.writeFile(wb, `SOP製程編碼_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
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
          .from('sop_ocr_results')
          .select('*')
          .in('group_id', groupIdsToExport)
          .order('group_id', { ascending: true })
          .order('operation', { ascending: true });
        
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
      .from('sop_groups')
      .update({ downloaded: false })
      .neq('group_id', 0);

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
            placeholder="搜尋料號、製程名稱、作業類型..."
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
        <Table>
          <TableHeader>
            <TableRow className="bg-purple-50 dark:bg-purple-950/30">
              <TableHead className="w-12">
                <Checkbox 
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-20 whitespace-nowrap">組號</TableHead>
              <TableHead className="w-12 whitespace-nowrap">狀態</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">料號</TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap">工序</TableHead>
              <TableHead className="w-24 whitespace-nowrap">序號</TableHead>
              <TableHead className="w-24 whitespace-nowrap">製程編碼</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">製程名稱</TableHead>
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
                    <TableCell className="font-mono text-sm whitespace-nowrap">{record.part_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{record.operation}</TableCell>
                    <TableCell>{record.sequence}</TableCell>
                    <TableCell>{record.process_code}</TableCell>
                    <TableCell className="whitespace-nowrap">{record.process_name}</TableCell>
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
            第 {currentPage} / {totalPages} 頁，共 {totalCount} 筆
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
