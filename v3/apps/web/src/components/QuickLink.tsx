import { Link } from 'react-router';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import type { QuickButton } from '@/lib/quick-buttons';

export function QuickLink({ q, first }: { q: QuickButton; first: boolean }) {
  return (
    <Button asChild size="lg" data-tour={first ? 'start-quick' : undefined} className={cn('h-16 w-full text-base', TOUR_RING)}>
      <Link to={q.to}>
        <Zap aria-hidden />
        {q.label}
      </Link>
    </Button>
  );
}
