// shadcn/ui Carousel (embla-carousel-react), angepasst: ohne sichtbare Pfeil-Buttons, dafür CarouselDots (Peek + Punkte).
import * as React from 'react';
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi;
  selectedIndex: number;
  scrollCount: number;
};

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) throw new Error('useCarousel muss innerhalb von <Carousel /> verwendet werden');
  return context;
}

function Carousel({ opts, setApi, className, children, ...props }: React.ComponentProps<'div'> & { opts?: CarouselOptions; setApi?: (api: CarouselApi) => void }) {
  const [carouselRef, api] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', ...opts, axis: 'x' });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollCount, setScrollCount] = React.useState(0);

  React.useEffect(() => {
    setApi?.(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;
    const update = () => {
      setSelectedIndex(api.selectedScrollSnap());
      setScrollCount(api.scrollSnapList().length);
    };
    update();
    api.on('select', update).on('reInit', update);
    return () => {
      api.off('select', update).off('reInit', update);
    };
  }, [api]);

  const onKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      api?.scrollPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      api?.scrollNext();
    }
  };

  return (
    <CarouselContext.Provider value={{ carouselRef, api, selectedIndex, scrollCount }}>
      <div onKeyDownCapture={onKeyDownCapture} className={cn('relative', className)} role="region" aria-roledescription="carousel" data-slot="carousel" {...props}>
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { carouselRef } = useCarousel();
  return (
    // p-1 -m-1: Platz für Fokus- und Tour-Ring innerhalb des abschneidenden Viewports, Layout bleibt gleich.
    <div ref={carouselRef} className="-m-1 overflow-hidden p-1" data-slot="carousel-content">
      <div className={cn('-ml-3 flex touch-pan-y', className)} {...props} />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="group" aria-roledescription="slide" data-slot="carousel-item" className={cn('min-w-0 shrink-0 grow-0 basis-full pl-3', className)} {...props} />;
}

/** Punkte für die Position; Klick scrollt zum Element. */
function CarouselDots({ className }: { className?: string }) {
  const { api, selectedIndex, scrollCount } = useCarousel();
  if (scrollCount < 2) return null;
  return (
    <div data-slot="carousel-dots" className={cn('mt-1 flex justify-center', className)}>
      {Array.from({ length: scrollCount }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={de.carousel.toPosition(i + 1)}
          aria-current={i === selectedIndex ? 'true' : undefined}
          onClick={() => api?.scrollTo(i)}
          className="group flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span aria-hidden className={cn('size-2.5 rounded-full transition-colors', i === selectedIndex ? 'bg-primary' : 'bg-muted-foreground/30')} />
        </button>
      ))}
    </div>
  );
}

export { Carousel, CarouselContent, CarouselItem, CarouselDots, type CarouselApi };
