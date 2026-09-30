export function Skrinshot({ src, alt, izoh }: { src: string; alt: string; izoh?: string }) {
  return (
    <figure className="my-6">
      <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-muted/20">
        {/* Kadr o'lchami har xil, next/image esa o'lcham talab qiladi. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="h-auto w-full" />
      </a>
      {izoh ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{izoh}</figcaption> : null}
    </figure>
  );
}
