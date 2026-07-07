import { useCallback, useRef, useState } from "react";
import { getCardImage } from "./scryfallImages";

type Preview = { url: string; x: number; y: number } | null;

export function CardName({ name, image }: { name: string; image?: string | null }) {
  const [preview, setPreview] = useState<Preview>(null);
  const hovering = useRef(false);

  const onEnter = useCallback(
    (e: React.MouseEvent) => {
      hovering.current = true;
      const x = e.clientX;
      const y = e.clientY;
      if (image) {
        setPreview({ url: image, x, y });
        return;
      }
      getCardImage(name).then((url) => {
        if (url && hovering.current) setPreview({ url, x, y });
      });
    },
    [name, image]
  );

  const onMove = useCallback((e: React.MouseEvent) => {
    setPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
  }, []);

  const onLeave = useCallback(() => {
    hovering.current = false;
    setPreview(null);
  }, []);

  // Keep the preview inside the viewport.
  const style: React.CSSProperties | undefined = preview
    ? {
        left: Math.min(preview.x + 16, window.innerWidth - 260),
        top: Math.max(8, Math.min(preview.y - 170, window.innerHeight - 350)),
      }
    : undefined;

  return (
    <span
      className="card-name"
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {name}
      {preview && (
        <img className="card-preview" src={preview.url} alt={name} style={style} />
      )}
    </span>
  );
}
