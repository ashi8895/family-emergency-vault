import { useEffect, useState } from 'react';
import { api, setAccessToken, setSessionLostHandler } from './api/client';
import AccessPage from './pages/AccessPage';
import AlivePage from './pages/AlivePage';
import ApprovePage from './pages/ApprovePage';
import AuthPage from './pages/AuthPage';
import InvitePage from './pages/InvitePage';
import VaultPage from './pages/VaultPage';
import { UiProvider } from './ui/UiProvider';
import type { Session } from './types';

function OwnerApp() {
  const [session, setSession] = useState<Session | null>(null);

  const lock = async () => {
    // Dropping the references is what "locks" the vault: no vault key in memory, nothing can be decrypted.
    setAccessToken(null);
    setSession(null);
    await api.post('/auth/logout').catch(() => undefined);
  };

  useEffect(() => {
    setSessionLostHandler(() => {
      setAccessToken(null);
      setSession(null);
    });
  }, []);

  return session ? <VaultPage session={session} onLock={lock} /> : <AuthPage onSignedIn={setSession} />;
}

export default function App() {
  // No router library needed: these few public pages are opened from emailed links by people without an account.
  const path = window.location.pathname;
  const invite = path.match(/^\/invite\/([A-Za-z0-9_-]{43})$/);
  const alive = path.match(/^\/alive\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  const access = path.match(/^\/access\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  const approve = path.match(/^\/approve\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (invite) return <InvitePage token={invite[1]} />;
  if (alive) return <AlivePage token={alive[1]} />;
  if (approve) return <ApprovePage token={approve[1]} />;
  if (access) return <AccessPage token={access[1]} />;
  return (
    <UiProvider>
      <OwnerApp />
    </UiProvider>
  );
}
