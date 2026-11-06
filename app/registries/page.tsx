'use client'
import styles from '@/css/infopages.module.css'
import r from './registries.module.css'
import { TopBar } from '@/components/TopBar/TopBar'
import { Button } from '@/components/Button/Button'
import { useEffect, useMemo, useState } from 'react'
import {
  getKnownDIDRegistries,
  fetchLegacyRegistryEntries,
  KnownRegistry,
  LegacyIssuerEntry,
} from '@/lib/knownRegistries'
import { EXTRA_KNOWN_REGISTRIES } from '@/lib/config'

type LoadedRegistry = KnownRegistry & {
  status: 'loading' | 'loaded' | 'error' | 'not-listable';
  entries?: Record<string, LegacyIssuerEntry>;
  error?: string;
}

const ourUrls = new Set<string | undefined>(EXTRA_KNOWN_REGISTRIES.map(reg => reg.url));

export default function Registries() {
  const [isDark, setIsDark] = useState(false);
  const [registries, setRegistries] = useState<LoadedRegistry[] | null>(null);
  const [didInput, setDidInput] = useState('');
  const [checkedDid, setCheckedDid] = useState('');

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = 'VerifierPlus Registries';

    let cancelled = false;
    (async () => {
      const list = await getKnownDIDRegistries();
      // Our own registries first: they're the ones being tested
      list.sort((a, b) => Number(ourUrls.has(b.url)) - Number(ourUrls.has(a.url)));
      const initial: LoadedRegistry[] = list.map(reg => ({
        ...reg,
        status: reg.type === 'dcc-legacy' && reg.url ? 'loading' : 'not-listable',
      }));
      if (cancelled) return;
      setRegistries(initial);

      initial.forEach((reg, i) => {
        if (reg.status !== 'loading') return;
        fetchLegacyRegistryEntries(reg.url!)
          .then(entries => ({ status: 'loaded' as const, entries }))
          .catch((err: unknown) => ({
            status: 'error' as const,
            // fetch() reports a CORS block as a bare TypeError
            error: err instanceof TypeError
              ? 'Could not download (network or CORS error). Verification will skip this registry.'
              : `Could not read registry: ${(err as Error).message}`,
          }))
          .then(update => {
            if (cancelled) return;
            setRegistries(prev => prev && prev.map((p, j) => (j === i ? { ...p, ...update } : p)));
          });
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const lookup = useMemo(() => {
    if (!checkedDid || !registries) return null;
    const hits = registries.filter(reg => reg.entries && checkedDid in reg.entries);
    const pending = registries.some(reg => reg.status === 'loading');
    return { hits, pending };
  }, [checkedDid, registries]);

  function checkDid(e?: React.FormEvent) {
    e?.preventDefault();
    setCheckedDid(didInput.trim());
  }

  return (
    <main className={styles.main}>
      <TopBar hasLogo={true} isDark={isDark} setIsDark={setIsDark} />
      <div className={styles.textContent}>
        <h1 className={styles.title}>Issuer Registries</h1>
        <p className={r.intro}>
          An issuer is shown as known when its DID appears in one of these registries.
          The DID must match the credential&apos;s <code>issuer.id</code> exactly.
        </p>

        <form className={r.lookup} onSubmit={checkDid}>
          <input
            type="text"
            aria-label="Issuer DID"
            placeholder="did:web:example.com or did:key:z6Mk…"
            value={didInput}
            onChange={e => setDidInput(e.target.value)}
          />
          {/* Submits the form */}
          <Button text="Check DID" />
        </form>

        {lookup && (
          lookup.hits.length > 0 ? (
            <div className={`${r.lookupResult} ${r.found}`} role="status">
              Found in {lookup.hits.map(h => `${h.name} (as “${h.entries![checkedDid].name ?? 'unnamed'}”)`).join(', ')}.
            </div>
          ) : (
            <div className={`${r.lookupResult} ${r.notFound}`} role="status">
              {lookup.pending
                ? 'Not found yet. Some registries are still loading.'
                : 'Not found in any listed registry file.'}
              {' '}Registries of type oidf aren&apos;t searched here, but are still checked during verification.
            </div>
          )
        )}

        {registries === null && <p className={r.muted}>Loading registry list…</p>}

        {registries?.map((reg, i) => (
          <section key={`${reg.name}-${i}`} className={r.registry}>
            <div className={r.registryHeader}>
              <h3>{reg.name}</h3>
              <span className={r.badge}>{reg.type}</span>
              {ourUrls.has(reg.url) && <span className={`${r.badge} ${r.ours}`}>added by this verifier</span>}
            </div>
            <p className={r.source}>
              <a href={reg.url ?? reg.trustAnchorEC} target="_blank" rel="noreferrer">{reg.url ?? reg.trustAnchorEC}</a>
            </p>

            {reg.status === 'loading' && <p className={r.muted}>Loading issuers…</p>}
            {reg.status === 'error' && <p className={r.error}>{reg.error}</p>}
            {reg.status === 'not-listable' && (
              <p className={r.muted}>OpenID Federation registry: issuers are looked up one at a time during verification and can&apos;t be listed.</p>
            )}
            {reg.status === 'loaded' && reg.entries && (() => {
              const dids = Object.keys(reg.entries);
              // Large registries: only list matches for the checked DID
              const LIST_LIMIT = 50;
              const shown = dids.length <= LIST_LIMIT ? dids : dids.filter(d => d === checkedDid);
              return (
                <>
                  <p className={r.muted}>
                    {dids.length} issuer{dids.length === 1 ? '' : 's'}
                    {dids.length > LIST_LIMIT && ' (too many to list; use the DID check above)'}
                  </p>
                  {shown.length > 0 && (
                    <ul className={r.entries}>
                      {shown.map(did => {
                        const entry = reg.entries![did];
                        return (
                          <li key={did} className={did === checkedDid ? r.highlight : undefined}>
                            <strong>{entry.name ?? 'Unnamed issuer'}</strong>
                            {entry.location && <span className={r.muted}> · {entry.location}</span>}
                            {entry.url && <> · <a href={entry.url} target="_blank" rel="noreferrer">{entry.url}</a></>}
                            <div className={r.did}>{did}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              );
            })()}
          </section>
        ))}
      </div>
    </main>
  );
}
