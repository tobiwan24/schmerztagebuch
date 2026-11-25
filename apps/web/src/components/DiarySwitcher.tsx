// Tagebuch-Umschalter oben (UI-24): nur bei mehreren Tagebüchern, auf Start, Verlauf und Auswertung.
import { useLocation } from 'react-router';
import { Select } from '@/components/ui/select';
import { TemplateIcon } from '@/components/TemplateIcon';
import { ALL_DIARIES, useDiaryScope } from '@/data/diary-scope';
import { de } from '@/i18n/de';

const WITH_ALL = ['/history', '/analysis'];
const SHOWN_ON = ['/', '/more/templates', ...WITH_ALL];

export function DiarySwitcher() {
  const { pathname } = useLocation();
  const allowAll = WITH_ALL.includes(pathname);
  const { diaryId, diaries, select } = useDiaryScope(allowAll);
  if (diaries.length < 2 || !SHOWN_ON.includes(pathname)) return null;
  const current = diaries.find((d) => d.id === diaryId);
  return (
    <div className="flex items-center gap-2">
      <TemplateIcon icon={current?.icon} color={current?.color} className="size-5" />
      <Select aria-label={de.diaryScope.label} value={diaryId ?? ALL_DIARIES} onChange={(e) => select(e.target.value)}>
        {allowAll ? <option value={ALL_DIARIES}>{de.diaryScope.all}</option> : null}
        {diaries.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
