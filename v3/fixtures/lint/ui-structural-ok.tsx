import { de } from '@/i18n/de';
export function A({ src }: { src: string }) {
  return (
    <form className="flex">
      <a href={src}>{de.nav.more}</a>
      <img src={src} alt={de.nav.more} />
      <output>{String(1)}</output>
    </form>
  );
}
