import type { Metadata } from 'next';
import { checkSubmitKey } from '@/lib/submitKey';
import { allLocations } from '@/lib/facts';
import SubmitForm from './SubmitForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Foto einreichen – Pflegeunion', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const valid = checkSubmitKey(k);
  return (
    <main className="submit-page">
      <img src="/api/asset/brand/logo-hauptversion.png" alt="Pflegeunion" className="submit-logo" />
      {valid ? (
        <SubmitForm submitKey={k!} locations={allLocations} />
      ) : (
        <div className="panel"><h2>Link ungültig</h2><p>Bitte frag im Marketing nach dem aktuellen Link.</p></div>
      )}
    </main>
  );
}
