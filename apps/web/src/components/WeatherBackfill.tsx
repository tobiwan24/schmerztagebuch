// Löst den Wetter-Nachtrag aus (BLK-34): nach dem Entsperren und beim Ereignis `online`.
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { createBackfillRunner } from '@/weather/backfill-runner';

export function WeatherBackfill() {
  const { status } = useAuth();
  const data = useData();
  const { diary, weather, stamper, bumpRevision } = data;
  const runner = useMemo(
    () =>
      createBackfillRunner({
        listDiaryIds: async () => (await diary.listDiaries()).map((d) => d.id),
        backfillDiary: async (id) => {
          const clock = await stamper.clock();
          const result = await weather.backfill(diary, id, () => clock.tick());
          if (result.filled > 0) await stamper.stamp(); // gespeicherten HLC-Stand nachziehen
          return result;
        },
      }),
    [diary, weather, stamper],
  );

  useEffect(() => {
    if (status !== 'unlocked') return;
    const run = () => void runner.run().then((r) => r.filled > 0 && bumpRevision()).catch(() => undefined);
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [status, runner, bumpRevision]);

  return null;
}
