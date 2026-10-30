'use client';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  menuFocusAfter,
  placeMenuItems,
  type PlaceAction,
} from '../lib/organize';

const icons = {
  settings: Settings,
  archive: Archive,
  restore: ArchiveRestore,
  delete: Trash2,
};
const MENU_WIDTH = 224;

export interface PlaceMenuHandle {
  /** Opens the menu at a point, for right-click. */
  openAt: (x: number, y: number) => void;
}
export interface PlaceMenuProps {
  kind: 'workspaces' | 'projects';
  item: { id: string; name: string };
  offline: boolean;
  onAction: (action: PlaceAction) => void;
  /** A labelled button ("Workspace options") instead of just "…". */
  labelled?: boolean;
  ref?: Ref<PlaceMenuHandle>;
}

/**
 * The options for a workspace or project: settings, Archive or Restore,
 * and Delete permanently…. Opened by its "…" button, by right-click on the
 * row (PlaceRow), or from the keyboard; arrow keys move, Escape closes.
 */
export function PlaceMenu({
  kind,
  item,
  offline,
  onAction,
  labelled = false,
  ref,
}: PlaceMenuProps) {
  const noun = kind === 'workspaces' ? 'Workspace' : 'Project';
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = placeMenuItems(kind, item, offline);
  const menuId = `place-menu-${item.id}`;
  function place(x: number, y: number) {
    // Keep the menu on screen: flip left or up near the edges.
    const height = 44 * items.length + 12;
    setAt({
      x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
      y: y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y,
    });
  }
  function openFromButton() {
    const box = button.current!.getBoundingClientRect();
    place(box.right - MENU_WIDTH, box.bottom + 4);
  }
  useImperativeHandle(ref, () => ({ openAt: place }));
  function close(refocus = true) {
    setAt(null);
    if (refocus) button.current?.focus();
  }
  useEffect(() => {
    if (!at) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: Event) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !button.current?.contains(event.target as Node)
      )
        close(false);
    };
    const shut = () => close(false);
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', shut, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', shut, true);
    };
  }, [at]);
  function keys(event: React.KeyboardEvent) {
    const entries = [
      ...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const next = menuFocusAfter(event.key, index, entries.length);
    if (next !== null) {
      event.preventDefault();
      entries[next].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close(false);
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className={labelled ? 'secondary place-options' : 'place-menu-button'}
        aria-label={labelled ? undefined : `${noun} options for ${item.name}`}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-controls={at ? menuId : undefined}
        title={labelled ? undefined : `${noun} options`}
        onClick={() => (at ? close() : openFromButton())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !at) {
            event.preventDefault();
            openFromButton();
          }
        }}
      >
        <Ellipsis size={labelled ? 14 : 15} aria-hidden="true" />
        {labelled && <span>{noun} options</span>}
      </button>
      {at && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={`${noun} options for ${item.name}`}
          className="place-menu"
          style={{ left: at.x, top: at.y, width: MENU_WIDTH }}
          onKeyDown={keys}
        >
          {items.map((entry) => {
            const Icon = icons[entry.action];
            return (
              <button
                key={entry.action}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={entry.action === 'delete' ? 'is-danger' : undefined}
                aria-disabled={entry.hint ? true : undefined}
                onClick={() => {
                  close();
                  onAction(entry.action);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span>
                  {entry.label}
                  {entry.hint && <small>{entry.hint}</small>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** A sidebar row whose right-click opens its options menu. */
export function PlaceRow({
  className,
  menu,
  children,
}: {
  className?: string;
  menu: Omit<PlaceMenuProps, 'ref'>;
  children: ReactNode;
}) {
  const handle = useRef<PlaceMenuHandle>(null);
  return (
    <div
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        // The keyboard's menu key reports no point: open by the row.
        const box = (event.target as Element).getBoundingClientRect();
        const fromKeys = !event.clientX && !event.clientY;
        handle.current?.openAt(
          fromKeys ? box.left : event.clientX,
          fromKeys ? box.bottom : event.clientY,
        );
      }}
    >
      {children}
      <PlaceMenu {...menu} ref={handle} />
    </div>
  );
}
