// Schnell-Buttons als Carousel; eigener Chunk, damit embla nicht im initialen Bundle liegt (Einzelknopf braucht es nicht).
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from '@/components/ui/carousel';
import { QuickLink } from '@/components/QuickLink';
import type { QuickButton } from '@/lib/quick-buttons';
import { de } from '@/i18n/de';

export default function QuickCarousel({ buttons }: { buttons: readonly QuickButton[] }) {
  return (
    <Carousel aria-label={de.start.quickLabel}>
      <CarouselContent>
        {buttons.map((q, i) => (
          <CarouselItem key={q.to} className="basis-[85%]">
            <QuickLink q={q} first={i === 0} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselDots />
    </Carousel>
  );
}
