import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import LangToggle from '../components/LangToggle';
import { api, ApiError } from '../api/client';
import { useI18n } from '../i18n';
import { formatDateTime } from '../types';

export interface ApproveInfo {
  status: 'ready' | 'already_approved' | 'waiting' | 'unlocked' | 'cancelled' | 'closed';
  ownerName: string;
  contactName: string;
  needed: number;
  approved: number;
  unlocksAt: string | null;
  waitingDays: number;
}

/** Presentational so it can be rendered without a network. */
export function ApproveView({
  info,
  tried,
  setTried,
  busy,
  onApprove,
}: {
  info: ApproveInfo;
  tried: boolean;
  setTried: (v: boolean) => void;
  busy: boolean;
  onApprove: () => void;
}) {
  const { t } = useI18n();
  const owner = info.ownerName;

  if (info.status === 'ready') {
    return (
      <div>
        <h1 className="text-3xl font-extrabold leading-tight">{t('approve.heading', { owner })}</h1>
        <p className="mt-4 text-lg">{t('approve.hello', { name: info.contactName, owner })}</p>

        <div className="mt-5 space-y-2 panel p-5">
          <p className="font-semibold">{t('approve.what')}</p>
          <ul className="space-y-2 text-lg">
            <li className="border-l-4 border-seal pl-3">{t('approve.p1', { needed: info.needed, approved: info.approved })}</li>
            <li className="border-l-4 border-seal pl-3">{t('approve.p2', { days: info.waitingDays, owner })}</li>
            <li className="border-l-4 border-seal pl-3">{t('approve.p3')}</li>
          </ul>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-md bg-brass-tint p-3 text-base">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={tried} onChange={(e) => setTried(e.target.checked)} />
          <span>{t('approve.confirm', { owner })}</span>
        </label>

        <button className="btn-primary mt-5 w-full py-3 text-lg" onClick={onApprove} disabled={!tried || busy}>
          {busy ? t('approve.saving') : t('approve.button')}
        </button>
        <p className="mt-3 text-center text-base text-muted">{t('approve.footer', { owner })}</p>
      </div>
    );
  }

  const block = (title: string, body: string) => (
    <div>
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-4 text-lg text-muted">{body}</p>
    </div>
  );

  switch (info.status) {
    case 'already_approved':
      return block(t('approve.done.title'), t('approve.done.body', { approved: info.approved, needed: info.needed }));
    case 'waiting':
      return block(
        t('approve.waiting.title'),
        info.unlocksAt ? t('approve.waiting.bodyOn', { date: formatDateTime(info.unlocksAt), owner }) : t('approve.waiting.body', { owner }),
      );
    case 'unlocked':
      return block(t('approve.unlocked.title'), t('approve.unlocked.body'));
    case 'closed':
      return block(t('approve.closed.title'), t('approve.closed.body', { owner }));
    default:
      return block(t('approve.cancelled.title', { owner }), t('approve.cancelled.body'));
  }
}

/** Opened by a trusted person from the approval email. Looking changes nothing; the button approves. */
export default function ApprovePage({ token }: { token: string }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<ApproveInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<ApproveInfo>(`/links/approve/${token}`)
      .then(setInfo)
      .catch((e) => setProblem(e instanceof ApiError ? e.message : t('approve.problem')));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve() {
    setBusy(true);
    setProblem(null);
    try {
      setInfo(await api.post<ApproveInfo>(`/links/approve/${token}`));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('approve.problem'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Logo label={t('brand')} />
        <LangToggle />
      </header>
      {problem && (
        <p role="alert" className="mb-4 rounded-md border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-lg text-sindoor">
          {problem}
        </p>
      )}
      {!problem && !info && <p className="text-lg text-muted">{t('common.loading')}</p>}
      {info && <ApproveView info={info} tried={tried} setTried={setTried} busy={busy} onApprove={approve} />}
    </main>
  );
}
