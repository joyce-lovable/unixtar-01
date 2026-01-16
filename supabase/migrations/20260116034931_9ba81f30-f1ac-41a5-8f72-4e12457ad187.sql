-- 建立 MBOM 結果資料表
CREATE TABLE public.mbom_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  file_name TEXT NOT NULL,
  customer_part_name TEXT NOT NULL,
  main_part_number TEXT NOT NULL,
  production_process TEXT NOT NULL DEFAULT '010',
  cad_sequence INTEGER NOT NULL,
  component_part_number TEXT NOT NULL,
  material_category TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  has_substitute TEXT NOT NULL DEFAULT 'N',
  material_quality TEXT NOT NULL DEFAULT '00',
  remark TEXT,
  source TEXT NOT NULL DEFAULT 'txt'
);

-- 建立複合唯一索引 (PK 組合)
CREATE UNIQUE INDEX idx_mbom_pk ON public.mbom_results (
  main_part_number, 
  production_process, 
  cad_sequence, 
  component_part_number, 
  material_category
);

-- 建立查詢索引
CREATE INDEX idx_mbom_main_part ON public.mbom_results (main_part_number);
CREATE INDEX idx_mbom_file_name ON public.mbom_results (file_name);
CREATE INDEX idx_mbom_created_at ON public.mbom_results (created_at DESC);

-- 啟用 RLS
ALTER TABLE public.mbom_results ENABLE ROW LEVEL SECURITY;

-- 建立 Public 存取政策 (暫時開放，待實作認證後再調整)
CREATE POLICY "Allow public select" ON public.mbom_results
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert" ON public.mbom_results
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON public.mbom_results
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete" ON public.mbom_results
  FOR DELETE USING (true);

-- 新增註解
COMMENT ON TABLE public.mbom_results IS 'MBOM 物料清單解析結果';
COMMENT ON COLUMN public.mbom_results.customer_part_name IS '客戶料號品名';
COMMENT ON COLUMN public.mbom_results.main_part_number IS '主件料號 (PK)';
COMMENT ON COLUMN public.mbom_results.production_process IS '生產工序 (PK)';
COMMENT ON COLUMN public.mbom_results.cad_sequence IS 'CAD項次 (PK)';
COMMENT ON COLUMN public.mbom_results.component_part_number IS '元件料號 (PK)';
COMMENT ON COLUMN public.mbom_results.material_category IS '用料類別 (PK)';
COMMENT ON COLUMN public.mbom_results.quantity IS '組成用量';
COMMENT ON COLUMN public.mbom_results.unit IS '單位 (系統代碼)';
COMMENT ON COLUMN public.mbom_results.has_substitute IS '是否使用代用品 (Y/N)';
COMMENT ON COLUMN public.mbom_results.material_quality IS '用料素質 (系統代碼)';
COMMENT ON COLUMN public.mbom_results.remark IS '備註說明';
COMMENT ON COLUMN public.mbom_results.source IS '資料來源 (txt/mold/sub)';