// Drop this at supabase/functions/ota-manifest/index.ts
//
// Deploy with:  ask Lovable "please deploy the ota-manifest edge function"
// Verify with:  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
//                 'https://{project-ref}.supabase.co/functions/v1/ota-manifest'
//               # Expect 400 (empty body), NOT 404 (function not deployed)
//
// Companion of ota-updater-client.ts. The mobile app POSTs its current
// bundle version + platform; this function returns either {update:false}
// or {update:true, url, version, sha256, minNativeVersion?}.
//
// Storage layout (set up in Supabase Dashboard → Storage):
//
//   Bucket:  ota-bundles  (PUBLIC = false, signed URLs only)
//   Path:    ios/{version}/bundle.zip
//            android/{version}/bundle.zip
//   Plus:    ios/{version}/bundle.sha256   (text file, the hex digest)
//
// Database table:
//
//   create table public.ota_releases (
//     id              uuid primary key default gen_random_uuid(),
//     platform        text not null check (platform in ('ios', 'android')),
//     version         text not null,
//     storage_path    text not null,             -- e.g. ios/2026.04.29-1/bundle.zip
//     sha256          text not null,
//     min_native_ver  text,                       -- optional: require app store update first
//     active          boolean not null default false,
//     released_at     timestamptz not null default now()
//   );
//   create unique index on public.ota_releases (platform, version);
//
// Mark a bundle live by:  update ota_releases set active = true where id = '...';

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ManifestRequest {
  platform: 'ios' | 'android';
  currentVersion: string;
  appVersion?: string; // CFBundleShortVersionString — for minNativeVersion checks
}

interface ManifestResponse {
  update: boolean;
  url?: string;
  version?: string;
  sha256?: string;
  minNativeVersion?: string;
}

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour — the app downloads immediately

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: ManifestRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (!body?.platform || !body?.currentVersion) {
    return new Response('missing platform/currentVersion', { status: 400 });
  }

  // Find the active release for this platform.
  const { data, error } = await supabase
    .from('ota_releases')
    .select('version, storage_path, sha256, min_native_ver')
    .eq('platform', body.platform)
    .eq('active', true)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return json({ update: false });
  }

  // Already on the active version → no update.
  if (data.version === body.currentVersion) {
    return json({ update: false });
  }

  // Generate a signed URL for the bundle.
  const { data: signed, error: signErr } = await supabase.storage
    .from('ota-bundles')
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error('[ota-manifest] signed URL failed:', signErr);
    return json({ update: false });
  }

  return json({
    update: true,
    url: signed.signedUrl,
    version: data.version,
    sha256: data.sha256,
    minNativeVersion: data.min_native_ver ?? undefined,
  });
});

function json<T>(payload: T, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
