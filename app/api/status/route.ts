import { NextResponse } from 'next/server';
import { aiTextEnabled } from '@/lib/ai';
import { aiImagesEnabled } from '@/lib/aiImage';
import { accentFontFile, listPeople } from '@/lib/assets';
import { instagramEnabled } from '@/lib/instagram';
import { draftsEnabled, storageMode } from '@/lib/storage';
import { audiences } from '@/lib/brand';
import { allLocations } from '@/lib/facts';
import { submitEnabled, submitKey } from '@/lib/submitKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    aiText: aiTextEnabled(),
    aiImages: aiImagesEnabled(),
    storage: storageMode(),
    drafts: draftsEnabled(),
    instagram: instagramEnabled(),
    accentFontLicensed: accentFontFile().licensed,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    people: listPeople(),
    audiences: Object.entries(audiences).map(([id, a]) => ({ id, label: a.label })),
    locations: allLocations,
    // the studio itself is behind basic auth, so it may show the share link
    submitKey: submitEnabled() ? submitKey() : null,
  });
}
