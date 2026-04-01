'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface AppBreadcrumbProps {
  libraryName?: string;
}

export default function AppBreadcrumb({ libraryName }: AppBreadcrumbProps) {
  const pathname = usePathname();
  const params = useParams();

  const isHome = pathname === '/';
  const librarySlug = params.librarySlug as string | undefined;
  const folderSegments = (params.folderPath as string[] | undefined) ?? [];

  if (isHome) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Home</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
        </BreadcrumbItem>

        {librarySlug && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {folderSegments.length === 0 ? (
                <BreadcrumbPage>{libraryName ?? librarySlug}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={`/library/${librarySlug}`} />}>
                  {libraryName ?? librarySlug}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {folderSegments.map((segment, i) => {
              const href = `/library/${librarySlug}/${folderSegments
                .slice(0, i + 1)
                .map(encodeURIComponent)
                .join('/')}`;
              const isLast = i === folderSegments.length - 1;
              return (
                <span key={href} className="flex items-center gap-1.5">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{decodeURIComponent(segment)}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={href} />}>
                        {decodeURIComponent(segment)}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              );
            })}
          </>
        )}

        {pathname.startsWith('/project/') && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Project</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}

        {pathname.startsWith('/settings') && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
