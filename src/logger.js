import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function createLogger(logDirectory) {
  const write = async (level, message, details) => {
    const entry = JSON.stringify({ time: new Date().toISOString(), level, message, ...(details ? { details } : {}) });
    console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`, details ?? '');
    try {
      await mkdir(logDirectory, { recursive: true });
      await appendFile(path.join(logDirectory, 'yokogawa-ai.log'), `${entry}\n`, 'utf8');
    } catch (error) {
      console.error('ログファイルへ書き込めません', error);
    }
  };
  return {
    info: (message, details) => void write('info', message, details),
    error: (message, details) => void write('error', message, details instanceof Error ? details.message : details),
  };
}

