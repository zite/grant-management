import { useQueryClient } from '@tanstack/react-query';
import { Layers, MoreHorizontal, Trash2, Users, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { saveView } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { EmptyState, IconButton } from '../components/primitives/bits';
import { MemberAvatar } from '../components/primitives/Avatar';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { errorMessage } from '../lib/errors';
import { countFilters, parseViewConfig } from '../lib/view';
import { qk } from '../lib/queries';
import { useWorkspace } from '../lib/workspace';

export function ViewsPage() {
  useDocumentTitle('Views');
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const groups = [
    { title: 'Shared with everyone', icon: <Users className="h-3.5 w-3.5" />, views: ws.views.filter(v => v.scope === 'Shared') },
    { title: 'Just you', icon: <UserRound className="h-3.5 w-3.5" />, views: ws.views.filter(v => v.scope !== 'Shared') },
  ];
  return (
    <>
      <PageHeader icon={<Layers />} title="Views" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ws.views.length === 0 ? (
          <EmptyState icon={<Layers />} title="No saved views yet" description="Filter any submission list, then choose “Save as view” from its ⋯ menu." />
        ) : (
          <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
            {groups.filter(g => g.views.length).map(g => (
              <section key={g.title}>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{g.icon} {g.title}</h2>
                <div className="divide-y rounded-lg border">
                  {g.views.map(v => {
                    const cfg = parseViewConfig(v.config);
                    const owner = v.ownerId ? ws.memberById.get(v.ownerId) : undefined;
                    const n = countFilters(cfg.filters);
                    return (
                      <div key={v.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <Link to={`/view/${v.id}`} className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-medium">{v.name}</div>
                          <div className="text-xs text-muted-foreground">{n} filter{n === 1 ? '' : 's'} · {cfg.options.layout ?? 'list'}</div>
                        </Link>
                        {owner && <MemberAvatar member={owner} size={20} />}
                        {(v.ownerId === ws.me.id || ws.isAdmin) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><IconButton aria-label="View actions"><MoreHorizontal /></IconButton></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-[13px] text-destructive focus:text-destructive"
                                onSelect={async () => {
                                  if (!(await app.confirm({ title: `Delete “${v.name}”?`, description: 'The submissions in it are not affected.', confirmLabel: 'Delete view', destructive: true }))) return;
                                  try {
                                    await saveView({ action: 'delete', id: v.id });
                                    await qc.invalidateQueries({ queryKey: qk.bootstrap });
                                    toast.success('View deleted');
                                  } catch (e) {
                                    toast.error(errorMessage(e, "Couldn't delete the view"));
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete view
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
