/** Keep native transport failures distinct from callable/server refusals. The
 * Functions SDK maps a rejected native fetch to `internal`, losing that boundary. */
export async function requestProfileHydration(input: {
  url: string; token: string; fetch: typeof fetch;
}): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    try {
      response = await input.fetch(input.url, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.token },
        body: JSON.stringify({ data: {} }) });
    } catch {
      throw Object.assign(Error('Profile connection is unavailable.'), { code: 'functions/unavailable' });
    }
    const reply = await response.json();
    if (!response.ok || reply.error) {
      const status = typeof reply.error?.status === 'string' ? reply.error.status.toLowerCase().replace(/_/g, '-')
        : response.status === 401 ? 'unauthenticated' : response.status === 403 ? 'permission-denied' : 'internal';
      throw Object.assign(Error('Profile request was refused.'), { code: 'functions/' + status, httpStatus: response.status });
    }
    if (Object.prototype.hasOwnProperty.call(reply, 'result')) return reply.result;
    if (Object.prototype.hasOwnProperty.call(reply, 'data')) return reply.data;
    throw Error('Invalid profile response.');
  } finally { clearTimeout(timer); }
}
