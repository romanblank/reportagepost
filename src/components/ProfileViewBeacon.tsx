'use client';

import { useEffect, useRef } from 'react';

// Однократный beacon просмотра профиля (боты без JS не пишут; владелец и дедуп —
// на роуте). keepalive: доедет даже при быстром уходе со страницы.
export function ProfileViewBeacon({ profileId }: { profileId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch('/api/profile-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
      keepalive: true,
    }).catch(() => {});
  }, [profileId]);
  return null;
}
