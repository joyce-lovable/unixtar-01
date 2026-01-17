/**
 * MBOM TXT 解析器
 * 用於解析實英實業股份有限公司的零件表 TXT 檔案
 * 
 * 支援功能：
 * - 一組「成品料號 + 品名」下可有多個半成品
 * - 透過「料號」變化和項次重新排列來識別半成品切換
 * - 項次 0 為半成品標記行，不計入零件清單
 */

export interface MbomItem {
  customerPartName: string;       // 客戶料號品名
  mainPartNumber: string;         // 主件料號 (PK) - 成品時放成品料號，半成品時放該半成品的料號
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
  sortOrder: number;              // 組內排序順序
}

/**
 * 半成品區段
 */
export interface SubAssembly {
  subPartNumber: string;      // 半成品的「料號」（會變成 mainPartNumber）
  items: RawItem[];           // 該半成品下的零件（項次 > 0）
  order: number;              // 在 TXT 中出現的順序（用於排序）
}

/**
 * 解析後的產品資料
 */
export interface ParsedProduct {
  mainPartNumber: string;         // 成品料號
  customerPartName: string;       // 品名
  mainItems: RawItem[];           // 成品區段的零件（項次 > 0）
  subAssemblies: SubAssembly[];   // 多個半成品，按出現順序排列
}

export interface RawItem {
  sequence: number;               // 項次
  partNumber: string;             // 零件料號
  quantity: string;               // 用量 (原始字串)
  unit: string;                   // 單位
  remark: string;                 // 備註
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
 * 解析 TXT 檔案內容，支援單一檔案包含多組成品
 * 
 * 解析規則：
 * 1. 每次出現新的「成品料號 + 品名」組合視為新的一組
 * 2. 第一個區段（料號 = 成品料號）為成品資料
 * 3. 料號不同於成品料號的區段為半成品
 * 4. 項次重新排列（從小數字開始）表示切換到新的半成品
 * 5. 項次 0 為半成品標記行，忽略不處理
 */
export function parseMbomTxt(content: string): ParsedProduct[] {
  const lines = content.split('\n');
  const products: ParsedProduct[] = [];
  
  // 當前組別追蹤
  let currentMainPartNumber = '';
  let currentCustomerPartName = '';
  let currentSectionPartNumber = '';
  let currentItems: RawItem[] = [];
  let lastSequence = -1;
  let currentRemark = '';
  let lastItem: RawItem | null = null;
  let mainItems: RawItem[] = [];
  let subAssemblies: SubAssembly[] = [];
  let subAssemblyOrder = 0;
  
  // 保存當前區段
  const saveCurrentSection = () => {
    if (currentItems.length === 0) return;
    
    if (currentSectionPartNumber === currentMainPartNumber || currentSectionPartNumber === '') {
      mainItems.push(...currentItems);
    } else {
      subAssemblies.push({
        subPartNumber: currentSectionPartNumber,
        items: [...currentItems],
        order: subAssemblyOrder++,
      });
    }
    currentItems = [];
    lastSequence = -1;
    lastItem = null;
  };
  
  // 保存當前產品組
  const saveCurrentProduct = () => {
    saveCurrentSection();
    
    if (currentMainPartNumber && currentCustomerPartName && (mainItems.length > 0 || subAssemblies.length > 0)) {
      products.push({
        mainPartNumber: currentMainPartNumber,
        customerPartName: currentCustomerPartName,
        mainItems: [...mainItems],
        subAssemblies: [...subAssemblies],
      });
    }
    
    // 重置所有追蹤變數
    mainItems = [];
    subAssemblies = [];
    subAssemblyOrder = 0;
    currentSectionPartNumber = '';
    currentItems = [];
    lastSequence = -1;
    lastItem = null;
    currentRemark = '';
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 偵測產品 header：成品料號 : XXX    品名 : YYY
    const mainMatch = line.match(/成品料號\s*:\s*(\S+)/);
    const nameMatch = line.match(/品名\s*:\s*(\S+)/);
    
    if (mainMatch && nameMatch) {
      const newMainPartNumber = mainMatch[1];
      const newCustomerPartName = nameMatch[1];
      
      // 如果成品料號或品名改變了，保存前一組並開始新組
      if (newMainPartNumber !== currentMainPartNumber || newCustomerPartName !== currentCustomerPartName) {
        saveCurrentProduct();
        currentMainPartNumber = newMainPartNumber;
        currentCustomerPartName = newCustomerPartName;
      }
      continue;
    }
    
    // 偵測區段 header 行：│料號:XXX
    const sectionHeaderMatch = line.match(/│料號:(\S+)\s+│/);
    if (sectionHeaderMatch) {
      const headerPartNumber = sectionHeaderMatch[1];
      
      if (headerPartNumber !== currentSectionPartNumber) {
        saveCurrentSection();
        currentSectionPartNumber = headerPartNumber;
      }
      continue;
    }
    
    // 解析零件行 (項次|零件料號|用量|單位|...)
    const itemMatch = line.match(/│\s*(\d+)│(\S+)\s*│\s*([\d./]+)\s*│(\S+)\s*│/);
    if (itemMatch) {
      if (lastItem && currentRemark) {
        lastItem.remark = currentRemark;
        currentRemark = '';
      }
      
      const sequence = parseInt(itemMatch[1], 10);
      const partNumber = itemMatch[2];
      const quantity = itemMatch[3];
      const unit = itemMatch[4];
      
      // 項次 0 為半成品標記行，忽略
      if (sequence === 0) {
        continue;
      }
      
      const item: RawItem = {
        sequence,
        partNumber,
        quantity,
        unit,
        remark: '',
      };
      
      currentItems.push(item);
      lastItem = item;
      lastSequence = sequence;
      continue;
    }
    
    // 解析備註行
    const remarkMatch = line.match(/│備註:(.*)│/);
    if (remarkMatch) {
      currentRemark = remarkMatch[1].trim();
      if (lastItem) {
        lastItem.remark = currentRemark;
        currentRemark = '';
      }
      continue;
    }
    
    // 解析獨立的備註行
    const remarkLineMatch = line.match(/備註:(.+)/);
    if (remarkLineMatch && lastItem) {
      const remarkText = remarkLineMatch[1].trim();
      if (remarkText && !lastItem.remark) {
        lastItem.remark = remarkText;
      }
    }
  }
  
  // 保存最後的備註和產品
  if (lastItem && currentRemark) {
    lastItem.remark = currentRemark;
  }
  saveCurrentProduct();
  
  return products;
}

/**
 * 組裝完整的 MBOM 資料
 * 
 * 順序規則:
 * 1. TXT 成品主要資料 (source: 'txt')
 * 2. 模具資料 (source: 'mold')
 * 3. TXT 半成品1資料 (source: 'sub')
 * 4. TXT 半成品2資料 (source: 'sub')
 * ... 依此類推，半成品按 TXT 中的順序排列
 */
export function assembleMbomData(
  parsed: ParsedProduct,
  moldData: MoldData[]
): MbomItem[] {
  const result: MbomItem[] = [];
  const { mainPartNumber, customerPartName, mainItems, subAssemblies } = parsed;
  
  let cadSequence = 1;
  let sortOrder = 1;  // 全組連續排序計數器
  
  // 1. 成品區段的零件 (source: 'txt')
  for (const item of mainItems) {
    const hasSubstitute = item.remark.includes('替代料') ? 'Y' : 'N';
    
    result.push({
      customerPartName,
      mainPartNumber,              // 成品料號
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
      sortOrder: sortOrder++,
    });
  }
  
  // 2. 模具資料 (source: 'mold')
  for (const mold of moldData) {
    result.push({
      customerPartName,
      mainPartNumber,              // 仍用成品料號
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
      sortOrder: sortOrder++,
    });
  }
  
  // 3. 依順序加入各半成品 (source: 'sub')
  // 半成品按照在 TXT 中出現的順序排列
  const sortedSubAssemblies = [...subAssemblies].sort((a, b) => a.order - b.order);
  
  for (const subAssembly of sortedSubAssemblies) {
    let subCadSequence = 1;
    
    for (const item of subAssembly.items) {
      const hasSubstitute = item.remark.includes('替代料') ? 'Y' : 'N';
      
      result.push({
        customerPartName,                    // 品名維持不變
        mainPartNumber: subAssembly.subPartNumber,  // 半成品的「料號」
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
        sortOrder: sortOrder++,
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
