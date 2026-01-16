-- mold_ocr_results: 新增 DELETE 權限
CREATE POLICY "Allow public delete"
  ON mold_ocr_results FOR DELETE
  USING (true);

-- sop_ocr_results: 新增 DELETE 權限
CREATE POLICY "Allow public delete"
  ON sop_ocr_results FOR DELETE
  USING (true);