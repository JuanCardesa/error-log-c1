export const ERRORLOG_ID_FIELD = 'ErrorLogId';

export function errorLogIdentity(namespace: string, errorId: number): string {
  return `errorlog::${namespace}::${String(errorId)}`;
}
