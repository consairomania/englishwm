-- ============================================================
-- 05 — STORAGE POLICIES
-- Bucket: lesson-images (imagini generate pentru modulul Voyager)
-- Sursa originală: Anonymous access policies for lesson-images bucket (Supabase)
-- ============================================================


-- ── Curăță politici vechi ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon upload lesson images"  ON storage.objects;
DROP POLICY IF EXISTS "anon select lesson images"  ON storage.objects;
DROP POLICY IF EXISTS "anon update lesson images"  ON storage.objects;
DROP POLICY IF EXISTS "anon delete lesson images"  ON storage.objects;


-- ── Politici pentru bucket-ul lesson-images ──────────────────────────────────

CREATE POLICY "anon upload lesson images"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'lesson-images');

CREATE POLICY "anon select lesson images"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'lesson-images');

CREATE POLICY "anon update lesson images"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'lesson-images');

CREATE POLICY "anon delete lesson images"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'lesson-images');
