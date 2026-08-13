import React from 'react';

type ForeclosurePageHeaderProps = {
  title: string;
  description: string;
  sourceHref: string;
  sourceLabel: string;
  fetchedAt?: string;
};

const ForeclosurePageHeader = ({
  title,
  description,
  sourceHref,
  sourceLabel,
  fetchedAt,
}: ForeclosurePageHeaderProps) => (
  <header className="mb-8 min-w-0 px-1 text-center">
    <h1 className="break-words text-2xl font-bold leading-tight text-blue-300 sm:text-3xl">{title}</h1>
    <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-gray-400">{description}</p>
    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
      <a
        href={sourceHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
      >
        {sourceLabel} ↗
      </a>
      {fetchedAt && (
        <p className="text-sm text-gray-400">
          Data fetched at: <span className="font-semibold text-gray-300">{fetchedAt}</span>
        </p>
      )}
    </div>
  </header>
);

export default ForeclosurePageHeader;
