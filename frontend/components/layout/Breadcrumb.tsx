'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

interface BreadcrumbProps {
  libraryName?: string;
}

export default function Breadcrumb({ libraryName }: BreadcrumbProps) {
  const pathname = usePathname();
  const params = useParams();

  const isHome = pathname === '/';
  const librarySlug = params.librarySlug as string | undefined;
  const folderSegments = (params.folderPath as string[] | undefined) ?? [];

  if (isHome) {
    return <div className="breadcrumb"><span>Home</span></div>;
  }

  return (
    <div className="breadcrumb">
      <Link href="/">Home</Link>

      {librarySlug && (
        <>
          <span> › </span>
          <Link href={`/library/${librarySlug}`}>
            {libraryName ?? librarySlug}
          </Link>
          {folderSegments.map((segment, i) => {
            const href = `/library/${librarySlug}/${folderSegments
              .slice(0, i + 1)
              .map(encodeURIComponent)
              .join('/')}`;
            const isLast = i === folderSegments.length - 1;
            return (
              <span key={href}>
                <span> › </span>
                {isLast ? (
                  <span>{decodeURIComponent(segment)}</span>
                ) : (
                  <Link href={href}>{decodeURIComponent(segment)}</Link>
                )}
              </span>
            );
          })}
        </>
      )}

      {pathname.startsWith('/project/') && <><span> › </span><span>Project</span></>}
      {pathname.startsWith('/settings') && <><span> › </span><span>Settings</span></>}
    </div>
  );
}
