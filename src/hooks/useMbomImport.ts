import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  parseMbomTxt, 
  assembleMbomData, 
  MbomItem, 
  MoldData,
  MBOM_HEADERS,
  mbomItemToArray
} from '@/lib/mbomParser';
import * as XLSX from 'xlsx';

export interface BatchMbomFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  parsedData?: MbomItem[];
  mainPartNumber?: string;
  customerPartName?: string;
  moldCount?: number;
  synced?: boolean;
}

export interface MbomImportState {
  files: BatchMbomFile[];
  isProcessing: boolean;
  isSyncing: boolean;
  currentProcessingIndex: number;
  selectedFileId: string | null;
  autoOverwrite: boolean;
}

export function useMbomImport() {
  const [state, setState] = useState<MbomImportState>({
    files: [],
    isProcessing: false,
    isSyncing: false,
    currentProcessingIndex: -1,
    selectedFileId: null,
    autoOverwrite: false,
  });

  /**
   * 從 Supabase 查詢模具資料
   */
  const fetchMoldData = async (partName: string): Promise<MoldData[]> => {
    const { data, error } = await supabase
      .from('mold_ocr_results')
      .select('mold_number, part_name, seq_number')
      .eq('part_name', partName)
      .order('seq_number');

    if (error) {
      console.error('查詢模具資料錯誤:', error);
      return [];
    }

    return (data || []).map(item => ({
      mold_number: item.mold_number,
      part_name: item.part_name,
      seq_number: item.seq_number,
    }));
  };

  /**
   * 處理單一 TXT 檔案
   */
  const processSingleFile = async (file: File): Promise<{
    parsedData: MbomItem[];
    mainPartNumber: string;
    customerPartName: string;
    moldCount: number;
  }> => {
    const content = await file.text();
    const parsed = parseMbomTxt(content);
    
    if (!parsed.mainPartNumber || !parsed.customerPartName) {
      throw new Error('無法從檔案中解析出成品料號或品名');
    }

    const moldData = await fetchMoldData(parsed.customerPartName);
    const mbomData = assembleMbomData(parsed, moldData);

    return {
      parsedData: mbomData,
      mainPartNumber: parsed.mainPartNumber,
      customerPartName: parsed.customerPartName,
      moldCount: moldData.length,
    };
  };

  /**
   * 新增多個檔案到佇列
   */
  const addFiles = useCallback((newFiles: File[]) => {
    const txtFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.txt'));
    
    if (txtFiles.length === 0) return;

    const batchFiles: BatchMbomFile[] = txtFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending' as const,
    }));

    setState(prev => {
      const updatedFiles = [...prev.files, ...batchFiles];
      return {
        ...prev,
        files: updatedFiles,
        selectedFileId: prev.selectedFileId || batchFiles[0]?.id || null,
      };
    });
  }, []);

  /**
   * 處理所有待處理的檔案
   */
  const processAllFiles = useCallback(async () => {
    const pendingFiles = state.files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    for (let i = 0; i < state.files.length; i++) {
      const file = state.files[i];
      if (file.status !== 'pending') continue;

      setState(prev => ({
        ...prev,
        currentProcessingIndex: i,
        files: prev.files.map((f, idx) => 
          idx === i ? { ...f, status: 'processing' as const } : f
        ),
      }));

      try {
        const result = await processSingleFile(file.file);

        setState(prev => ({
          ...prev,
          files: prev.files.map((f, idx) => 
            idx === i ? {
              ...f,
              status: 'completed' as const,
              parsedData: result.parsedData,
              mainPartNumber: result.mainPartNumber,
              customerPartName: result.customerPartName,
              moldCount: result.moldCount,
            } : f
          ),
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '處理檔案時發生錯誤';
        setState(prev => ({
          ...prev,
          files: prev.files.map((f, idx) => 
            idx === i ? { ...f, status: 'error' as const, error: errorMessage } : f
          ),
        }));
      }
    }

    setState(prev => ({ ...prev, isProcessing: false, currentProcessingIndex: -1 }));
  }, [state.files]);

  /**
   * 移除單一檔案
   */
  const removeFile = useCallback((fileId: string) => {
    setState(prev => {
      const updatedFiles = prev.files.filter(f => f.id !== fileId);
      let newSelectedId = prev.selectedFileId;
      
      if (prev.selectedFileId === fileId) {
        newSelectedId = updatedFiles.length > 0 ? updatedFiles[0].id : null;
      }
      
      return {
        ...prev,
        files: updatedFiles,
        selectedFileId: newSelectedId,
      };
    });
  }, []);

  /**
   * 選擇要查看的檔案
   */
  const selectFile = useCallback((fileId: string) => {
    setState(prev => ({ ...prev, selectedFileId: fileId }));
  }, []);

  /**
   * 清除所有檔案
   */
  const clearAll = useCallback(() => {
    setState({
      files: [],
      isProcessing: false,
      isSyncing: false,
      currentProcessingIndex: -1,
      selectedFileId: null,
      autoOverwrite: false,
    });
  }, []);

  /**
   * 匯出單一檔案的 Excel
   */
  const exportSingleExcel = useCallback((fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file?.parsedData) return;

    const wsData = [
      MBOM_HEADERS,
      ...file.parsedData.map(mbomItemToArray),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MBOM');

    ws['!cols'] = [
      { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 40 },
    ];

    const baseName = file.name.replace(/\.txt$/i, '');
    XLSX.writeFile(wb, `${baseName}_MBOM.xlsx`);
  }, [state.files]);

  /**
   * 匯出全部（合併為一個工作表）
   */
  const exportAllMerged = useCallback(() => {
    const completedFiles = state.files.filter(f => f.status === 'completed' && f.parsedData);
    if (completedFiles.length === 0) return;

    const allData: MbomItem[] = [];
    completedFiles.forEach(file => {
      if (file.parsedData) {
        allData.push(...file.parsedData);
      }
    });

    const wsData = [
      MBOM_HEADERS,
      ...allData.map(mbomItemToArray),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MBOM_合併');

    ws['!cols'] = [
      { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 40 },
    ];

    XLSX.writeFile(wb, `MBOM_批次匯出_合併.xlsx`);
  }, [state.files]);

  /**
   * 匯出全部（每檔一個工作表）
   */
  const exportAllSeparate = useCallback(() => {
    const completedFiles = state.files.filter(f => f.status === 'completed' && f.parsedData);
    if (completedFiles.length === 0) return;

    const wb = XLSX.utils.book_new();

    completedFiles.forEach(file => {
      if (!file.parsedData) return;

      const wsData = [
        MBOM_HEADERS,
        ...file.parsedData.map(mbomItemToArray),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 40 },
      ];

      // 使用料號作為工作表名稱（最多 31 字元）
      const sheetName = (file.mainPartNumber || file.name.replace(/\.txt$/i, '')).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `MBOM_批次匯出_分頁.xlsx`);
  }, [state.files]);

  /**
   * 設定自動覆蓋選項
   */
  const setAutoOverwrite = useCallback((value: boolean) => {
    setState(prev => ({ ...prev, autoOverwrite: value }));
  }, []);

  /**
   * 同步單一檔案到 Supabase
   */
  const syncSingleFile = useCallback(async (fileId: string, overwrite: boolean = false) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file?.parsedData || file.parsedData.length === 0) return;

    setState(prev => ({ ...prev, isSyncing: true }));

    try {
      const fileName = file.name;
      const customerPartName = file.customerPartName;

      // 如果需要覆蓋，先刪除該客戶料號品名的舊資料
      if (overwrite && customerPartName) {
        await supabase
          .from('mbom_results')
          .delete()
          .eq('customer_part_name', customerPartName);
      }

      // 準備插入資料
      const insertData = file.parsedData.map(item => ({
        file_name: fileName,
        customer_part_name: item.customerPartName,
        main_part_number: item.mainPartNumber,
        production_process: item.productionProcess,
        cad_sequence: item.cadSequence,
        component_part_number: item.componentPartNumber,
        material_category: item.materialCategory,
        quantity: item.quantity,
        unit: item.unit,
        has_substitute: item.hasSubstitute,
        material_quality: item.materialQuality,
        remark: item.remark || '',
        source: item.source,
      }));

      const { error } = await supabase
        .from('mbom_results')
        .insert(insertData);

      if (error) {
        if (error.code === '23505') {
          // 唯一鍵衝突
          toast.error(`同步失敗：${fileName} 資料已存在，請勾選「遇重複自動覆蓋」重試`);
        } else {
          throw error;
        }
      } else {
        // 更新檔案狀態為已同步
        setState(prev => ({
          ...prev,
          files: prev.files.map(f => 
            f.id === fileId ? { ...f, synced: true } : f
          ),
        }));
        toast.success(`${fileName} 已成功同步至資料庫`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失敗';
      toast.error(`同步錯誤：${errorMessage}`);
    } finally {
      setState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [state.files]);

  /**
   * 同步所有已完成的檔案到 Supabase
   */
  const syncAllFiles = useCallback(async () => {
    const completedFiles = state.files.filter(f => f.status === 'completed' && f.parsedData && !f.synced);
    if (completedFiles.length === 0) {
      toast.info('沒有需要同步的檔案');
      return;
    }

    setState(prev => ({ ...prev, isSyncing: true }));

    let successCount = 0;
    let errorCount = 0;

    for (const file of completedFiles) {
      try {
        const fileName = file.name;
        const customerPartName = file.customerPartName;

        // 如果自動覆蓋，先刪除該客戶料號品名的舊資料
        if (state.autoOverwrite && customerPartName) {
          await supabase
            .from('mbom_results')
            .delete()
            .eq('customer_part_name', customerPartName);
        }

        const insertData = file.parsedData!.map(item => ({
          file_name: fileName,
          customer_part_name: item.customerPartName,
          main_part_number: item.mainPartNumber,
          production_process: item.productionProcess,
          cad_sequence: item.cadSequence,
          component_part_number: item.componentPartNumber,
          material_category: item.materialCategory,
          quantity: item.quantity,
          unit: item.unit,
          has_substitute: item.hasSubstitute,
          material_quality: item.materialQuality,
          remark: item.remark || '',
          source: item.source,
        }));

        const { error } = await supabase
          .from('mbom_results')
          .insert(insertData);

        if (error) {
          if (error.code === '23505') {
            errorCount++;
          } else {
            throw error;
          }
        } else {
          successCount++;
          setState(prev => ({
            ...prev,
            files: prev.files.map(f => 
              f.id === file.id ? { ...f, synced: true } : f
            ),
          }));
        }
      } catch (error) {
        errorCount++;
        console.error(`同步 ${file.name} 失敗:`, error);
      }
    }

    setState(prev => ({ ...prev, isSyncing: false }));

    if (successCount > 0 && errorCount === 0) {
      toast.success(`成功同步 ${successCount} 個檔案至資料庫`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`同步完成：${successCount} 個成功，${errorCount} 個失敗（可能重複）`);
    } else {
      toast.error(`同步失敗：${errorCount} 個檔案發生錯誤，請勾選「遇重複自動覆蓋」重試`);
    }
  }, [state.files, state.autoOverwrite]);

  // 計算統計資料
  const completedFiles = state.files.filter(f => f.status === 'completed');
  const pendingCount = state.files.filter(f => f.status === 'pending').length;
  const completedCount = completedFiles.length;
  const errorCount = state.files.filter(f => f.status === 'error').length;
  const syncedCount = state.files.filter(f => f.synced).length;
  const totalItems = completedFiles.reduce((sum, f) => sum + (f.parsedData?.length || 0), 0);
  const totalMolds = completedFiles.reduce((sum, f) => sum + (f.moldCount || 0), 0);

  // 取得目前選中的檔案資料
  const selectedFile = state.files.find(f => f.id === state.selectedFileId);

  return {
    files: state.files,
    isProcessing: state.isProcessing,
    isSyncing: state.isSyncing,
    autoOverwrite: state.autoOverwrite,
    currentProcessingIndex: state.currentProcessingIndex,
    selectedFileId: state.selectedFileId,
    selectedFile,
    pendingCount,
    completedCount,
    errorCount,
    syncedCount,
    totalItems,
    totalMolds,
    addFiles,
    processAllFiles,
    removeFile,
    selectFile,
    clearAll,
    exportSingleExcel,
    exportAllMerged,
    exportAllSeparate,
    setAutoOverwrite,
    syncSingleFile,
    syncAllFiles,
  };
}
