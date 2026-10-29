'use client';
import { createContext, useContext } from 'react';
import { Bot } from 'lucide-react';
import type { AgentTokenRecord } from '@ordo/client';
import { byAgent } from '../lib/agents';

/** Key names for "By agent · <key>", loaded once for the signed-in account. */
export const AgentNames = createContext<
  Pick<AgentTokenRecord, 'id' | 'name'>[]
>([]);

/** "By agent · Claude Code" on an item an assistant created; nothing otherwise. */
export function ByAgent({
  item,
  className = 'by-agent',
}: {
  item: { origin?: string; createdByTokenId?: string | null };
  className?: string;
}) {
  const label = byAgent(item, useContext(AgentNames));
  if (!label) return null;
  return (
    <span className={className}>
      <Bot size={10} aria-hidden="true" /> {label}
    </span>
  );
}
