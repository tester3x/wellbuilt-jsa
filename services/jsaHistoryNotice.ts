/** Presentation only: never grants read/acknowledgement or route authority. */
export function jsaHistoryNotice(status: 'checking' | 'found' | 'backend_required' | 'unavailable', openingRequestedRead: boolean) {
  if (openingRequestedRead || status === 'checking') return 'checking' as const;
  return status === 'found' ? null : status;
}
