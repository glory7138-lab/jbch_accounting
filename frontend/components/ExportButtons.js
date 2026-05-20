'use client';

export default function ExportButtons({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="actions export-actions">
      {items.map((item) => (
        <a key={item.href} href={item.href} className="export-link" target="_blank" rel="noreferrer">
          {item.label}
        </a>
      ))}
    </div>
  );
}
