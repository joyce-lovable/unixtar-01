import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  parseMbomTxt, 
  assembleMbomData, 
  MbomItem, 
  MoldData,
  MBOM_HEADERS,
  mbomItemToArray
} from '@/lib/mbomParser';
import * as XLSX from 'xlsx';

export interface MbomImportState {
  isProcessing: boolean;
  isLoading: boolean;
  error: string | null;
  parsedData: MbomItem[] | null;
  fileName: string | null;
  mainPartNumber: string | null;
  customerPartName: string | null;
  moldCount: number;
}

export function useMbomImport() {
  const [state, setState] = useState<MbomImportState>({
    isProcessing: false,
    isLoading: false,
    error: null,
    parsedData: null,
    fileName: null,
    mainPartNumber: null,
    customerPartName: null,
    moldCount: 0,
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
   * 處理上傳的 TXT 檔案
   */
  const processFile = useCallback(async (file: File) => {
    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      isLoading: true,
      error: null,
      parsedData: null,
      fileName: file.name,
    }));

    try {
      // 讀取檔案內容
      const content = await file.text();
      
      // 解析 TXT 內容
      const parsed = parseMbomTxt(content);
      
      if (!parsed.mainPartNumber || !parsed.customerPartName) {
        throw new Error('無法從檔案中解析出成品料號或品名');
      }

      setState(prev => ({ 
        ...prev, 
        mainPartNumber: parsed.mainPartNumber,
        customerPartName: parsed.customerPartName,
      }));

      // 查詢模具資料
      const moldData = await fetchMoldData(parsed.customerPartName);
      
      setState(prev => ({ 
        ...prev, 
        moldCount: moldData.length,
      }));

      // 組裝完整 MBOM 資料
      const mbomData = assembleMbomData(parsed, moldData);

      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        isLoading: false,
        parsedData: mbomData,
      }));

      return mbomData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '處理檔案時發生錯誤';
      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        isLoading: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  /**
   * 匯出 Excel 檔案
   */
  const exportToExcel = useCallback(() => {
    if (!state.parsedData) return;

    // 建立工作表資料
    const wsData = [
      MBOM_HEADERS,
      ...state.parsedData.map(mbomItemToArray),
    ];

    // 建立工作簿
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MBOM');

    // 設定欄位寬度
    ws['!cols'] = [
      { wch: 18 },  // 客戶料號品名
      { wch: 20 },  // 主件料號
      { wch: 12 },  // 生產工序
      { wch: 12 },  // CAD項次
      { wch: 20 },  // 元件料號
      { wch: 12 },  // 用料類別
      { wch: 12 },  // 組成用量
      { wch: 14 },  // 單位
      { wch: 16 },  // 是否使用代用品
      { wch: 14 },  // 用料素質
      { wch: 40 },  // 備註說明
    ];

    // 產生檔名
    const baseName = state.fileName?.replace(/\.txt$/i, '') || 'MBOM';
    const exportFileName = `${baseName}_MBOM.xlsx`;

    // 下載檔案
    XLSX.writeFile(wb, exportFileName);
  }, [state.parsedData, state.fileName]);

  /**
   * 清除資料
   */
  const clearData = useCallback(() => {
    setState({
      isProcessing: false,
      isLoading: false,
      error: null,
      parsedData: null,
      fileName: null,
      mainPartNumber: null,
      customerPartName: null,
      moldCount: 0,
    });
  }, []);

  return {
    ...state,
    processFile,
    exportToExcel,
    clearData,
  };
}
