// The picture-deletions cron deletes a queued path only under that same row's "<user_id>/"
// (the Code Reviewer, #241): never another folder, never a path that climbs out of it.
export const underOwnFolder = (row: { user_id: string; path: string }) =>
  /^[0-9a-f-]{36}$/.test(row.user_id) && row.path.startsWith(`${row.user_id}/`) && !row.path.includes("..") && row.path.length > row.user_id.length + 1;
