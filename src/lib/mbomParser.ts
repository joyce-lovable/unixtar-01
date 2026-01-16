/**
 * MBOM TXT 解析器
 * 用於解析實英實業股份有限公司的零件表 TXT 檔案
 */

export interface MbomItem {
  customerPartName: string;       // 客戶料號品名
  mainPartNumber: string;         // 主件料號 (PK)
  productionProcess: string;      // 生產工序 (PK)
  cadSequence: number;            // CAD項次 (PK)
  componentPartNumber: string;    // 元件料號 (PK)
  materialCategory: string;       // 用料類別 (PK)
  quantity: number;               // 組成用量
  unit: string;                   // 單位 (系統代碼)
  hasSubstitute: string;          // 是否使用代用品(Y/N)
  materialQuality: string;        // 用料素質 (系統代碼)
  remark: string;                 // 備註說明
  source: 'txt' | 'mold' | 'sub'; // 資料來源標記
}

export interface ParsedProduct {
  mainPartNumber: string;         // 成品料號
  customerPartName: string;       // 品名
  items: RawItem[];               // 零件項目
}

export interface RawItem {
  sequence: number;               // 項次
  partNumber: string;             // 零件料號
  quantity: string;               // 用量 (原始字串)
  unit: string;                   // 單位
  remark: string;                 // 備註
  isSubAssembly?: boolean;        // 是否為半成品 (項次=0)
  subAssemblyPartNumber?: string; // 半成品料號 (僅當 isSubAssembly=true)
}

export interface MoldData {
  mold_number: string;
  part_name: string;
  seq_number: number;
}

/**
 * 解析用量字串，處理分數格式
 * 例如: "1.12000" → 1.12, "0.1530/1000" → 0.000153
 */
export function parseQuantity(quantityStr: string): number {
  const trimmed = quantityStr.trim();
  
  // 處理分數格式 (如 "0.1530/1000")
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
  }
  
  // 一般數字格式
  const value = parseFloat(trimmed);
  return isNaN(value) ? 0 : value;
}

/**
 * 格式化用量為適當的小數位數
 */
export function formatQuantity(value: number): number {
  // 根據數值大小決定小數位數
  if (value >= 1) {
    return Math.round(value * 100) / 100; // 2位小數
  } else if (value >= 0.01) {
    return Math.round(value * 10000) / 10000; // 4位小數
  } else {
    return Math.round(value * 1000000) / 1000000; // 6位小數
  }
}

/**
 * 解析 TXT 檔案內容
 */
export function parseMbomTxt(content: string): ParsedProduct {
  const lines = content.split('\n');
  
  // 擷取成品料號和品名
  let mainPartNumber = '';
  let customerPartName = '';
  
  for (const line of lines) {
    // 尋找成品料號和品名
    const mainMatch = line.match(/成品料號\s*:\s*(\S+)/);
    if (mainMatch) {
      mainPartNumber = mainMatch[1];
    }
    
    const nameMatch = line.match(/品名\s*:\s*(\S+)/);
    if (nameMatch && !customerPartName) {
      customerPartName = nameMatch[1];
    }
    
    if (mainPartNumber && customerPartName) break;
  }
  
  // 擷取所有零件項目
  const items: RawItem[] = [];
  let currentRemark = '';
  let lastItem: RawItem | null = null;
  let inSubAssemblySection = false;
  let currentSubAssemblyPartNumber = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 偵測半成品區段 (料號行含有不同的料號)
    const subAssemblyHeaderMatch = line.match(/│料號:(\S+)\s+│.*│\(半成品\)P\/N:/);
    if (subAssemblyHeaderMatch) {
      const headerPartNumber = subAssemblyHeaderMatch[1];
      if (headerPartNumber !== mainPartNumber) {
        inSubAssemblySection = true;
        currentSubAssemblyPartNumber = headerPartNumber;
      }
    }
    
    // 解析零件行 (項次|零件料號|用量|單位|...)
    const itemMatch = line.match(/│\s*(\d+)│(\S+)\s*│\s*([\d./]+)\s*│(\S+)\s*│/);
    if (itemMatch) {
      // 先保存前一個項目的備註
      if (lastItem && currentRemark) {
        lastItem.remark = currentRemark;
        currentRemark = '';
      }
      
      const sequence = parseInt(itemMatch[1], 10);
      const partNumber = itemMatch[2];
      const quantity = itemMatch[3];
      const unit = itemMatch[4];
      
      const item: RawItem = {
        sequence,
        partNumber,
        quantity,
        unit,
        remark: '',
        isSubAssembly: sequence === 0,
      };
      
      // 如果是半成品項次 (0)，標記下一批項目屬於此半成品
      if (sequence === 0) {
        item.subAssemblyPartNumber = partNumber;
        inSubAssemblySection = true;
        currentSubAssemblyPartNumber = partNumber;
      } else if (inSubAssemblySection && currentSubAssemblyPartNumber) {
        item.subAssemblyPartNumber = currentSubAssemblyPartNumber;
      }
      
      items.push(item);
      lastItem = item;
    }
    
    // 解析備註行
    const remarkMatch = line.match(/│備註:(.*)│/);
    if (remarkMatch) {
      currentRemark = remarkMatch[1].trim();
      if (lastItem) {
        lastItem.remark = currentRemark;
        currentRemark = '';
      }
    }
  }
  
  return {
    mainPartNumber,
    customerPartName,
    items,
  };
}

/**
 * 組裝完整的 MBOM 資料
 * 順序: TXT 主產品零件 → 模具資料 → 半成品零件
 */
export function assembleMbomData(
  parsed: ParsedProduct,
  moldData: MoldData[]
): MbomItem[] {
  const result: MbomItem[] = [];
  const { mainPartNumber, customerPartName, items } = parsed;
  
  // 分離主產品零件和半成品零件
  const mainItems: RawItem[] = [];
  const subAssemblyGroups: Map<string, RawItem[]> = new Map();
  
  for (const item of items) {
    if (item.isSubAssembly) {
      // 項次 0 的半成品標記，跳過但記錄
      continue;
    }
    
    if (item.subAssemblyPartNumber) {
      // 屬於半成品的零件
      if (!subAssemblyGroups.has(item.subAssemblyPartNumber)) {
        subAssemblyGroups.set(item.subAssemblyPartNumber, []);
      }
      subAssemblyGroups.get(item.subAssemblyPartNumber)!.push(item);
    } else {
      // 主產品零件
      mainItems.push(item);
    }
  }
  
  let cadSequence = 1;
  
  // 1. 加入主產品零件 (TXT)
  for (const item of mainItems) {
    const hasSubstitute = item.remark.includes('可替代料號') ? 'Y' : 'N';
    
    result.push({
      customerPartName,
      mainPartNumber,
      productionProcess: '010',
      cadSequence: cadSequence++,
      componentPartNumber: item.partNumber,
      materialCategory: '1',
      quantity: formatQuantity(parseQuantity(item.quantity)),
      unit: item.unit,
      hasSubstitute,
      materialQuality: '00',
      remark: item.remark,
      source: 'txt',
    });
  }
  
  // 2. 加入模具資料 (Supabase)
  for (const mold of moldData) {
    result.push({
      customerPartName,
      mainPartNumber,
      productionProcess: '010',
      cadSequence: cadSequence++,
      componentPartNumber: mold.mold_number,
      materialCategory: '4',
      quantity: 0.0001,
      unit: 'ST',
      hasSubstitute: 'N',
      materialQuality: '90',
      remark: '',
      source: 'mold',
    });
  }
  
  // 3. 加入半成品零件 (TXT)
  for (const [subPartNumber, subItems] of subAssemblyGroups) {
    let subCadSequence = 1;
    
    for (const item of subItems) {
      const hasSubstitute = item.remark.includes('可替代料號') ? 'Y' : 'N';
      
      result.push({
        customerPartName,
        mainPartNumber: subPartNumber,
        productionProcess: '010',
        cadSequence: subCadSequence++,
        componentPartNumber: item.partNumber,
        materialCategory: '1',
        quantity: formatQuantity(parseQuantity(item.quantity)),
        unit: item.unit,
        hasSubstitute,
        materialQuality: '00',
        remark: item.remark,
        source: 'sub',
      });
    }
  }
  
  return result;
}

/**
 * 匯出欄位標題 (中文)
 */
export const MBOM_HEADERS = [
  '客戶料號品名',
  '主件料號 (PK)',
  '生產工序 (PK)',
  'CAD項次 (PK)',
  '元件料號 (PK)',
  '用料類別 (PK)',
  '組成用量',
  '單位 (系統代碼)',
  '是否使用代用品(Y/N)',
  '用料素質 (系統代碼)',
  '備註說明',
];

/**
 * 將 MbomItem 轉換為陣列 (用於 Excel 匯出)
 */
export function mbomItemToArray(item: MbomItem): (string | number)[] {
  return [
    item.customerPartName,
    item.mainPartNumber,
    item.productionProcess,
    item.cadSequence,
    item.componentPartNumber,
    item.materialCategory,
    item.quantity,
    item.unit,
    item.hasSubstitute,
    item.materialQuality,
    item.remark,
  ];
}
