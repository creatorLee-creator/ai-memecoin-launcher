import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Activity, AlertOctagon, ArrowRight, BadgeCheck, Blocks, Check,
  ChevronRight, CircleHelp, Coins, FileClock, Fingerprint, Gauge, History, House,
  Layers3, LockKeyhole, LogOut, Network, RefreshCw, Search, Shield,
  ShieldCheck, Sparkles, Wallet, X,
} from 'lucide-react';
import {
  getGetLauncherOverviewQueryKey, getGetSafetySettingsQueryKey, getHealthCheckQueryKey,
  getListLauncherAuditEventsQueryKey, getListLauncherLaunchesQueryKey,
  useCreateDemoLaunch, useGenerateDemoToken, useGetLauncherOverview, useGetSafetySettings,
  useHealthCheck, useListLauncherAuditEvents, useListLauncherLaunches, useUpdateSafetySettings,
  type AuditEvent, type GeneratedToken, type LaunchRecord,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const stamp = (value?: string) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function RouterBridge({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const route = (to: string) => setLocation(stripBase(to));
  return <ClerkProvider
    publishableKey={clerkKey}
    proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    routerPush={route}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your private demo workspace' } },
      signUp: { start: { title: 'Create your workspace', subtitle: 'Your private, demo-only launcher' } },
    }}
    appearance={{
      theme: shadcn,
      cssLayerName: 'clerk',
      options: {
        logoPlacement: 'inside',
        logoLinkUrl: basePath || '/',
        logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
      },
      variables: {
        colorPrimary: '#83d0a0',
        colorForeground: '#e3ece5',
        colorMutedForeground: '#94a59a',
        colorDanger: '#ef8278',
        colorBackground: '#17211c',
        colorInput: '#101815',
        colorInputForeground: '#e3ece5',
        colorNeutral: '#314237',
        borderRadius: '12px',
        fontFamily: 'DM Sans, sans-serif',
      },
      elements: {
        cardBox: {
          backgroundColor: '#17211c',
          borderRadius: '16px',
          width: 'min(440px, calc(100vw - 28px))',
          maxWidth: '100%',
          overflow: 'hidden',
        },
        card: '!shadow-none !border-0 !bg-transparent !rounded-none',
        footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
        headerTitle: 'text-[#e3ece5] font-semibold',
        headerSubtitle: 'text-[#94a59a]',
        formFieldLabel: 'text-[#d8e4dc]',
        formFieldInput: 'clerk-input',
        formButtonPrimary: 'clerk-submit',
        footerActionText: 'text-[#94a59a]',
        footerActionLink: 'clerk-link',
        socialButtonsBlockButtonText: 'text-[#dce5df]',
      },
    }}
  >{children}</ClerkProvider>;
}

function HealthBadge() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60_000 } });
  const ready = health.data?.status === 'ok' || health.data?.status === 'healthy';
  return <span className="health-pill" data-testid="status-api-health"><i className="health-indicator" />{health.isLoading ? 'CHECKING SERVICE' : health.isError ? 'SERVICE UNAVAILABLE' : ready ? 'SERVICE CONNECTED' : 'DEMO WORKSPACE'}</span>;
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><Blocks size={17} /></div><div><div className="brand-name">launch / studio</div><div className="brand-kicker">Personal workspace</div></div></div>;
}

function SideNav({ active }: { active: string }) {
  const items = [{ href: '/dashboard', label: 'Workspace', icon: House }, { href: '/history', label: 'Launch history', icon: History }, { href: '/safety', label: 'Safety controls', icon: ShieldCheck }];
  return <>
    <aside className="sidebar"><Brand /><div className="nav-label">Workspace</div><nav className="nav-list">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} />{label}</Link>)}</nav>
      <div className="side-note"><strong><i className="live-dot" />Demo environment</strong>Nothing here can sign, fund, or broadcast a transaction. Records stay clearly marked as demos.</div><div className="sidebar-footer">SOLANA · PRIVATE INSTANCE</div>
    </aside>
    <nav className="mobile-nav">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={active === href ? 'active' : ''}><Icon />{label}</Link>)}</nav>
  </>;
}

function AppFrame({ children, active }: { children: ReactNode; active: string }) {
  const { signOut } = useClerk();
  return <div className="app-shell"><div className="frame"><SideNav active={active} /><main className="main"><header className="topbar"><div className="mobile-head"><div className="brand-mark"><Blocks size={15} /></div>launch / studio</div><HealthBadge /><button className="button button-quiet" onClick={() => void signOut()} data-testid="button-sign-out"><LogOut size={14} />Sign out</button></header>{children}</main></div></div>;
}

function LoadingCard() {
  return <div className="card card-pad" aria-label="Loading content"><div style={{ height: 12, width: '34%', borderRadius: 6, background: '#26352d' }} /><div style={{ height: 90, marginTop: 20, borderRadius: 12, background: 'linear-gradient(90deg,#151f1a,#1b2921,#151f1a)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} /><div style={{ height: 11, width: '63%', marginTop: 18, borderRadius: 6, background: '#202e26' }} /></div>;
}

function QueryError({ retry }: { retry: () => void }) {
  return <div className="error-box" role="alert">Unable to load this workspace data. Check the service connection, then try again.<div style={{ marginTop: 10 }}><button className="button button-quiet" onClick={retry} data-testid="button-retry"><RefreshCw size={13} />Retry</button></div></div>;
}

function Intro() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && isSignedIn) setLocation('/dashboard'); }, [isLoaded, isSignedIn, setLocation]);
  if (isLoaded && isSignedIn) return <div className="auth-wrap"><LoadingCard /></div>;
  return <div className="app-shell"><div className="landing"><nav className="landing-nav"><Brand /><div style={{ display: 'flex', gap: 9 }}><Link href="/sign-in" className="button button-quiet" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="button button-primary" data-testid="link-create-account">Open workspace <ArrowRight size={14} /></Link></div></nav>
    <section className="landing-hero"><div><div className="eyebrow">A considered place to experiment</div><h1 className="landing-title">Ideas first.<br /><span>Nothing goes live.</span></h1><p className="landing-copy">A private Solana token concept workspace for shaping metadata, reviewing each detail, and keeping a persistent record of demo-only launches. No wallet. No broadcast. No surprises.</p><div className="button-row"><Link href="/sign-in" className="button button-primary">Enter your workspace <ArrowRight size={15} /></Link><span className="mode-chip"><i className="health-indicator" />DEMO MODE ONLY</span></div></div>
      <div className="hero-art"><div className="orbit" /><div className="orbit two" /><div className="hero-core"><Layers3 /></div><div className="hero-tag one">METADATA · REVIEW</div><div className="hero-tag two">ON-CHAIN · DISABLED</div></div></section>
    <div className="landing-foot"><span>PRIVATE BY DESIGN · SOLANA CONCEPTS</span><span>NO WALLET · NO LIVE TRANSACTIONS</span></div>
  </div></div>;
}

function AuthPage({ kind }: { kind: 'sign-in' | 'sign-up' }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && isSignedIn) setLocation('/dashboard'); }, [isLoaded, isSignedIn, setLocation]);
  return <div className="auth-wrap"><div><div className="auth-brand"><span className="brand-mark"><Blocks size={17} /></span>launch / studio</div>{kind === 'sign-in' ?
    <SignIn path={`${basePath}/sign-in`} routing="path" signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} forceRedirectUrl={`${basePath}/dashboard`} /> :
    <SignUp path={`${basePath}/sign-up`} routing="path" signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} forceRedirectUrl={`${basePath}/dashboard`} />}
    <p style={{ textAlign: 'center', color: '#718178', fontSize: 10, marginTop: 16 }}>Private access · Demo-only environment</p></div></div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && !isSignedIn) setLocation('/sign-in'); }, [isLoaded, isSignedIn, setLocation]);
  if (!isLoaded || !isSignedIn) return <div className="auth-wrap"><LoadingCard /></div>;
  return <>{children}</>;
}

function Dashboard() {
  const overview = useGetLauncherOverview({ query: { queryKey: getGetLauncherOverviewQueryKey() } });
  const launches = useListLauncherLaunches({ query: { queryKey: getListLauncherLaunchesQueryKey() } });
  const generate = useGenerateDemoToken();
  const createLaunch = useCreateDemoLaunch();
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [token, setToken] = useState<GeneratedToken | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const invalidateLaunchData = () => {
    void cache.invalidateQueries({ queryKey: getGetLauncherOverviewQueryKey() });
    void cache.invalidateQueries({ queryKey: getListLauncherLaunchesQueryKey() });
    void cache.invalidateQueries({ queryKey: getListLauncherAuditEventsQueryKey() });
  };
  const onGenerate = (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    generate.mutate({ data: { name: name.trim(), description: description.trim() } }, {
      onSuccess: result => { setToken(result); setName(result.name); setDescription(result.description); },
      onError: () => setError('Could not generate sample metadata. Your draft has not been changed.'),
    });
  };
  const onCreate = () => {
    if (!token) return;
    setError(''); setNotice('');
    createLaunch.mutate({ data: { name: token.name, ticker: token.ticker, description: token.description, artworkSeed: token.artworkSeed } }, {
      onSuccess: () => { setNotice('Demo record saved to your launch history. No wallet or transaction was created.'); invalidateLaunchData(); },
      onError: () => setError('The demo record could not be saved. Nothing was broadcast.'),
    });
  };
  const busy = generate.isPending || createLaunch.isPending;
  return <AppFrame active="/dashboard"><div className="page">
    <div className="page-head"><div><div className="eyebrow">Personal launch workspace / 01</div><h1 className="page-title">Concept desk</h1><p className="page-subtitle">Shape a token concept, inspect its sample metadata, then save it as a demo record.</p></div><span className="mode-chip"><i className="health-indicator" />DEMO-ONLY MODE</span></div>
    <div className="metric-grid">
      {overview.isLoading ? <><LoadingCard /><LoadingCard /><LoadingCard /></> : overview.isError ? <div className="card card-pad" style={{ gridColumn: '1/-1' }}><QueryError retry={() => void overview.refetch()} /></div> : <>
        <div className="metric"><div className="metric-label">Saved records</div><div className="metric-value" data-testid="value-total-records">{overview.data?.totalLaunchRecords ?? 0}</div><div className="metric-detail">Persistent demo entries</div></div>
        <div className="metric"><div className="metric-label">Created today</div><div className="metric-value" data-testid="value-launches-today">{overview.data?.launchesToday ?? 0}</div><div className="metric-detail">No on-chain activity</div></div>
        <div className="metric"><div className="metric-label">Wallet balance</div><div className="metric-value">0 <span style={{ fontSize: 13, color: '#87978e' }}>SOL</span></div><div className="metric-detail">Wallet not created</div></div>
      </>}
    </div>
    <div className="dashboard-grid">
      <section className="card card-pad"><div className="card-head"><div><div className="eyebrow">Drafting / 01</div><h2 className="section-title" style={{ marginTop: 8 }}>Create a token concept</h2><p className="section-copy">Request deterministic sample copy and placeholder artwork metadata.</p></div><div className="brand-mark"><Sparkles size={16} /></div></div>
        <form onSubmit={onGenerate}><div className="field"><label htmlFor="token-name">Concept name</label><input id="token-name" className="input" data-testid="input-token-name" required maxLength={32} placeholder="e.g. Moss Signal" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="token-description">Short description <span style={{ color: '#718178', fontWeight: 400 }}>· optional</span></label><textarea id="token-description" className="textarea" data-testid="input-token-description" maxLength={280} placeholder="What is the idea behind this token?" value={description} onChange={e => setDescription(e.target.value)} /><div className="field-hint">{description.length}/280 characters</div></div>
          <div className="button-row"><button className="button button-primary" type="submit" disabled={generate.isPending || !name.trim()} data-testid="button-generate-token">{generate.isPending ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}{generate.isPending ? 'Preparing sample…' : 'Generate sample concept'}</button>{token && <button type="button" className="button button-secondary" onClick={() => { setToken(null); setNotice(''); setError(''); }} data-testid="button-clear-draft"><X size={14} />Clear draft</button>}</div>
        </form>
        <div className="generation-note"><CircleHelp size={15} /><span><strong>Demo generation only.</strong> The endpoint returns deterministic sample metadata; no external AI service is called.</span></div>
        {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="success-box" role="status">{notice}</div>}
      </section>
      <section className="card card-pad"><div className="card-head"><div><div className="eyebrow">Review / 02</div><h2 className="section-title" style={{ marginTop: 8 }}>Preview</h2><p className="section-copy">Review before saving your demo record.</p></div><span className="demo-badge">NOT LIVE</span></div>
        {token ? <><div className="preview-art"><div className="art-mark">{token.ticker.slice(0, 2)}</div></div><div className="preview-meta"><div><div className="token-name" data-testid="text-preview-name">{token.name}</div><div className="token-ticker">${token.ticker}</div></div><span className="mono">SAMPLE</span></div><p className="token-description">{token.description}</p>
          <div className="button-row"><button className="button button-primary" onClick={onCreate} disabled={busy || overview.isLoading || overview.isError || !overview.data || overview.data.emergencyStop} data-testid="button-save-demo-launch">{createLaunch.isPending ? 'Saving record…' : overview.data?.emergencyStop ? 'Emergency stop active' : overview.isLoading ? 'Checking workspace…' : 'Save demo launch record'}<ArrowRight size={14} /></button></div>
          <div className="field-hint" style={{ marginTop: 10 }}>Saved records have no contract address and no transaction signature.</div>
        </> : <div className="empty-state"><div className="empty-icon"><Layers3 size={19} /></div><h3>Your review appears here</h3><p>Generate a sample concept to inspect its name, ticker, description, and placeholder artwork.</p></div>}
      </section>
    </div>
    <section className="card card-pad" style={{ marginTop: 18 }}><div className="card-head"><div><div className="eyebrow">Workspace status</div><h2 className="section-title" style={{ marginTop: 8 }}>No live connections</h2></div><BadgeCheck size={18} color="#83c99d" /></div>
      {overview.isLoading ? <LoadingCard /> : overview.data && <div className="overview-strip"><div className="overview-item"><span className="overview-label">Wallet</span><span className="overview-value unavailable">Not created</span></div><div className="overview-item"><span className="overview-label">Pump.fun</span><span className="overview-value unavailable">Not configured</span></div><div className="overview-item"><span className="overview-label">Broadcast</span><span className="overview-value unavailable">Unavailable</span></div></div>}
      <div style={{ marginTop: 13, color: '#82938a', fontSize: 11 }}>Funding, signing, and broadcast controls are not available in this workspace.</div>
    </section>
    {!launches.isLoading && launches.data && launches.data.length > 0 && <section className="card card-pad" style={{ marginTop: 18 }}><div className="card-head"><div><div className="eyebrow">Recently saved</div><h2 className="section-title" style={{ marginTop: 8 }}>Latest demo record</h2></div><Link className="nav-link" href="/history">View history <ChevronRight size={14} /></Link></div><RecordItem record={launches.data[0]} /></section>}
  </div></AppFrame>;
}

function RecordItem({ record }: { record: LaunchRecord }) {
  return <article className="record" data-testid={`record-launch-${record.id}`}><div className="record-art">{record.ticker.slice(0, 2)}</div><div style={{ minWidth: 0 }}><div className="activity-name">{record.name}</div><div className="record-desc">{record.description || 'No description provided.'}</div><div className="record-meta"><span className="mono">${record.ticker}</span><span className="field-hint">Saved {stamp(record.createdAt)}</span></div></div><span className="demo-badge">DEMO ONLY</span></article>;
}

function HistoryPage() {
  const records = useListLauncherLaunches({ query: { queryKey: getListLauncherLaunchesQueryKey() } });
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => (records.data ?? []).filter(record => `${record.name} ${record.ticker} ${record.description}`.toLowerCase().includes(filter.toLowerCase())), [records.data, filter]);
  return <AppFrame active="/history"><div className="page"><div className="page-head"><div><div className="eyebrow">Persistent records / 02</div><h1 className="page-title">Launch history</h1><p className="page-subtitle">A durable record of demo-only concepts saved from this workspace.</p></div><span className="mode-chip"><FileClock size={13} />RECORDS ONLY</span></div>
    {records.isLoading ? <div className="stack"><LoadingCard /><LoadingCard /></div> : records.isError ? <div className="card card-pad"><QueryError retry={() => void records.refetch()} /></div> : <>
      <div className="card card-pad"><div className="card-head" style={{ alignItems: 'center' }}><div><div className="eyebrow">Archive</div><h2 className="section-title" style={{ marginTop: 7 }}>{records.data?.length ?? 0} saved {(records.data?.length ?? 0) === 1 ? 'record' : 'records'}</h2></div><label className="search-field"><Search size={15} /><input className="input" aria-label="Search records" data-testid="input-history-search" placeholder="Search concepts…" value={filter} onChange={e => setFilter(e.target.value)} /></label></div>
        {visible.length > 0 ? <div className="record-list">{visible.map(record => <RecordItem key={record.id} record={record} />)}</div> : <div className="empty-state"><div className="empty-icon">{records.data?.length ? <Search size={18} /> : <History size={18} />}</div><h3>{records.data?.length ? 'No matching concepts' : 'Your archive is clear'}</h3><p>{records.data?.length ? 'Try a different name or ticker.' : 'When you save a demo launch record, it will be listed here for future review.'}</p>{filter && <button className="button button-quiet" style={{ marginTop: 14 }} onClick={() => setFilter('')} data-testid="button-clear-search">Clear search</button>}</div>}
      </div>
      <div className="notice" style={{ marginTop: 15 }}><strong>Record integrity.</strong> Contract address: Not created. Transaction signature: Not broadcast. These records do not represent on-chain launches.</div>
    </>}</div></AppFrame>;
}

function AuditItem({ event }: { event: AuditEvent }) {
  return <div className="activity-row"><div className="audit-line"><i className="audit-mark" /><div className="activity-main"><div className="activity-name">{event.action}</div><div className="activity-detail">{event.detail}</div></div></div><div className="activity-time">{stamp(event.createdAt)}</div></div>;
}

function SafetyPage() {
  const settings = useGetSafetySettings({ query: { queryKey: getGetSafetySettingsQueryKey() } });
  const audit = useListLauncherAuditEvents({ query: { queryKey: getListLauncherAuditEventsQueryKey() } });
  const update = useUpdateSafetySettings();
  const cache = useQueryClient();
  const [values, setValues] = useState({ maxPerLaunchSol: '', dailyLimitSol: '', dailyLaunchLimit: '' });
  const [initialized, setInitialized] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (settings.data && !initialized) {
      setValues({ maxPerLaunchSol: String(settings.data.maxPerLaunchSol), dailyLimitSol: String(settings.data.dailyLimitSol), dailyLaunchLimit: String(settings.data.dailyLaunchLimit) });
      setInitialized(true);
    }
  }, [settings.data, initialized]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setSaveMessage(''); setSaveError('');
    const payload = { maxPerLaunchSol: Number(values.maxPerLaunchSol), dailyLimitSol: Number(values.dailyLimitSol), dailyLaunchLimit: Number(values.dailyLaunchLimit) };
    if (!Number.isFinite(payload.maxPerLaunchSol) || payload.maxPerLaunchSol < 0 || payload.maxPerLaunchSol > 100 || !Number.isFinite(payload.dailyLimitSol) || payload.dailyLimitSol < 0 || payload.dailyLimitSol > 500 || !Number.isInteger(payload.dailyLaunchLimit) || payload.dailyLaunchLimit < 0 || payload.dailyLaunchLimit > 100) {
      setSaveError('Use values within the displayed policy ranges. Launch count must be a whole number.'); return;
    }
    update.mutate({ data: payload }, { onSuccess: result => { cache.setQueryData(getGetSafetySettingsQueryKey(), result); setSaveMessage('Safety policies saved. These values do not authorize spending.'); void cache.invalidateQueries({ queryKey: getListLauncherAuditEventsQueryKey() }); void cache.invalidateQueries({ queryKey: getGetLauncherOverviewQueryKey() }); }, onError: () => setSaveError('Settings could not be saved. Try again when the service is available.') });
  };
  const toggleEmergency = () => {
    if (!settings.data) return;
    update.mutate({ data: { emergencyStop: !settings.data.emergencyStop } }, { onSuccess: result => { cache.setQueryData(getGetSafetySettingsQueryKey(), result); setSaveMessage(result.emergencyStop ? 'Emergency stop engaged.' : 'Emergency stop released.'); void cache.invalidateQueries({ queryKey: getListLauncherAuditEventsQueryKey() }); void cache.invalidateQueries({ queryKey: getGetLauncherOverviewQueryKey() }); }, onError: () => setSaveError('Emergency stop could not be updated. Try again.') });
  };
  return <AppFrame active="/safety"><div className="page"><div className="page-head"><div><div className="eyebrow">Guardrails / 03</div><h1 className="page-title">Safety controls</h1><p className="page-subtitle">Review policy limits, workspace availability, and recent changes.</p></div><span className="mode-chip"><Shield size={13} />OPERATOR CONTROL</span></div>
    {settings.isLoading ? <div className="stack"><LoadingCard /><LoadingCard /></div> : settings.isError ? <div className="card card-pad"><QueryError retry={() => void settings.refetch()} /></div> : !settings.data ? <div className="card card-pad"><QueryError retry={() => void settings.refetch()} /></div> : <div className="safety-grid">
      <div className="stack">
        <section className="card card-pad"><div className="card-head"><div><div className="eyebrow">Policy settings</div><h2 className="section-title" style={{ marginTop: 8 }}>Spending limits</h2><p className="section-copy">These are safety policies only. They do not reserve funds or authorize transactions.</p></div><Gauge size={18} color="#87c99c" /></div>
          <form onSubmit={submit}><div className="setting-line"><div><h3>Maximum per launch</h3><p>Policy ceiling in SOL · 0 to 100</p></div><input className="input number-input" type="number" min="0" max="100" step="0.01" value={values.maxPerLaunchSol} onChange={e => setValues(v => ({ ...v, maxPerLaunchSol: e.target.value }))} aria-label="Maximum per launch in SOL" data-testid="input-max-per-launch" /></div>
            <div className="setting-line"><div><h3>Daily SOL limit</h3><p>Policy ceiling in SOL · 0 to 500</p></div><input className="input number-input" type="number" min="0" max="500" step="0.01" value={values.dailyLimitSol} onChange={e => setValues(v => ({ ...v, dailyLimitSol: e.target.value }))} aria-label="Daily limit in SOL" data-testid="input-daily-limit" /></div>
            <div className="setting-line"><div><h3>Daily launch limit</h3><p>Maximum record count · 0 to 100</p></div><input className="input number-input" type="number" min="0" max="100" step="1" value={values.dailyLaunchLimit} onChange={e => setValues(v => ({ ...v, dailyLaunchLimit: e.target.value }))} aria-label="Daily launch limit" data-testid="input-daily-launch-limit" /></div>
            <div className="button-row"><button className="button button-primary" type="submit" disabled={update.isPending} data-testid="button-save-safety">{update.isPending ? 'Saving policies…' : 'Save safety policies'}<Check size={14} /></button></div>
          </form>{saveError && <div className="error-box" role="alert">{saveError}</div>}{saveMessage && <div className="success-box" role="status">{saveMessage}</div>}
        </section>
        <section className="card card-pad"><div className="card-head"><div><div className="eyebrow">Audit trail</div><h2 className="section-title" style={{ marginTop: 8 }}>Recent activity</h2><p className="section-copy">Safety changes and demo actions recorded by the service.</p></div><Activity size={17} color="#83c99d" /></div>
          {audit.isLoading ? <div style={{ display: 'grid', gap: 14 }}><LoadingCard /></div> : audit.isError ? <QueryError retry={() => void audit.refetch()} /> : audit.data?.length ? audit.data.map(event => <AuditItem key={event.id} event={event} />) : <div className="empty-state"><div className="empty-icon"><FileClock size={18} /></div><h3>No activity recorded</h3><p>Recent safety and demo actions will appear here.</p></div>}
        </section>
      </div>
      <div className="stack">
        <section className={`card card-pad ${settings.data.emergencyStop ? '' : ''}`}><div className="card-head"><div><div className="eyebrow">Immediate control</div><h2 className="section-title" style={{ marginTop: 8 }}>Emergency stop</h2><p className="section-copy">Stops new demo records from being created.</p></div><AlertOctagon size={18} color={settings.data.emergencyStop ? '#e08f84' : '#83c99d'} /></div>
          <div className="setting-line"><div><h3>{settings.data.emergencyStop ? 'Engaged' : 'Not engaged'}</h3><p>{settings.data.emergencyStop ? 'New demo record actions are paused.' : 'Demo record creation is available.'}</p></div><button className={`switch ${settings.data.emergencyStop ? 'on' : ''}`} role="switch" aria-checked={settings.data.emergencyStop} aria-label="Emergency stop" onClick={toggleEmergency} disabled={update.isPending} data-testid="switch-emergency-stop"><span /></button></div>
        </section>
        <section className="card card-pad"><div className="card-head"><div><div className="eyebrow">Connectivity</div><h2 className="section-title" style={{ marginTop: 8 }}>Wallet unavailable</h2></div><Wallet size={17} color="#baa77f" /></div>
          <div className="notice"><strong>Not created.</strong> This workspace has no wallet. A balance of 0 SOL is reported by configuration; no wallet balance has been queried.</div>
          <div className="wallet-panel"><div><div className="wallet-label">Wallet address</div><div className="wallet-value muted">Not created</div></div><LockKeyhole size={15} color="#998869" /></div>
          <div className="wallet-panel"><div><div className="wallet-label">Balance</div><div className="wallet-value">0 SOL</div></div><Coins size={15} color="#91c79e" /></div>
          <button className="button button-secondary disabled-action" type="button" disabled aria-disabled="true" data-testid="button-funding-unavailable"><LockKeyhole size={14} />Funding unavailable</button>
          <button className="button button-secondary disabled-action" type="button" disabled aria-disabled="true" data-testid="button-signing-unavailable"><Fingerprint size={14} />Signing unavailable</button>
          <button className="button button-secondary disabled-action" type="button" disabled aria-disabled="true" data-testid="button-broadcast-unavailable"><Network size={14} />Broadcast unavailable</button>
          <div className="field-hint" style={{ marginTop: 12 }}>Pump.fun is not configured. No network launch controls are available.</div>
        </section>
      </div>
    </div>}
  </div></AppFrame>;
}

function Shell() {
  const { isLoaded, userId } = useAuth();
  const cache = useQueryClient();
  useEffect(() => { if (isLoaded) void cache.clear(); }, [isLoaded, userId, cache]);
  return <Switch>
    <Route path="/" component={Intro} />
    <Route path="/sign-in/*?" component={() => <AuthPage kind="sign-in" />} />
    <Route path="/sign-up/*?" component={() => <AuthPage kind="sign-up" />} />
    <Route path="/dashboard">{() => <RequireAuth><Dashboard /></RequireAuth>}</Route>
    <Route path="/history">{() => <RequireAuth><HistoryPage /></RequireAuth>}</Route>
    <Route path="/safety">{() => <RequireAuth><SafetyPage /></RequireAuth>}</Route>
    <Route component={NotFound} />
  </Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><RouterBridge><RoutedErrorBoundary><Shell /></RoutedErrorBoundary></RouterBridge></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
