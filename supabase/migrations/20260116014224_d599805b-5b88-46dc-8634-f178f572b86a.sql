-- 建立 SOP OCR 結果表格
CREATE TABLE public.sop_ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  part_number text NOT NULL,
  operation text NOT NULL,
  sequence text NOT NULL,
  process_code integer NOT NULL,
  process_name text NOT NULL,
  file_name text
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_sop_ocr_part_number ON public.sop_ocr_results(part_number);
CREATE INDEX idx_sop_ocr_created_at ON public.sop_ocr_results(created_at DESC);

-- 新增欄位註解
COMMENT ON TABLE public.sop_ocr_results IS 'SOP製程及編碼OCR解析結果';
COMMENT ON COLUMN public.sop_ocr_results.part_number IS '料號（從檔名提取，去除-UN和副檔名）';
COMMENT ON COLUMN public.sop_ocr_results.operation IS '工序';
COMMENT ON COLUMN public.sop_ocr_results.sequence IS '序號';
COMMENT ON COLUMN public.sop_ocr_results.process_code IS '製程編碼';
COMMENT ON COLUMN public.sop_ocr_results.process_name IS '製程名稱';
COMMENT ON COLUMN public.sop_ocr_results.file_name IS '原始檔案名稱';