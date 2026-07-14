'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard недоступен — молча
    }
  }
  return (
    <button type="button" onClick={copy} className="text-xs text-accent underline">
      {copied ? ru.adminInvites.copied : ru.adminInvites.copy}
    </button>
  );
}
