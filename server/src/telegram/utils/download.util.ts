import https from 'https';

export async function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const { statusCode = 0 } = res;
        if (statusCode < 200 || statusCode >= 300) {
          // Drain the body so the socket is freed. The URL is not quoted:
          // a Telegram file link carries the bot token.
          res.resume();
          reject(new Error(`File download failed: HTTP ${statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      // Without this listener a failed connection (ENOTFOUND, ECONNRESET)
      // is an uncaught exception that takes the whole server down.
      .on('error', reject);
  });
}
