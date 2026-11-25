import { Input } from '@/components/ui/input';

export function A({ withTime }: { withTime: boolean }) {
  return <Input type={withTime ? 'datetime-local' : 'date'} />;
}
