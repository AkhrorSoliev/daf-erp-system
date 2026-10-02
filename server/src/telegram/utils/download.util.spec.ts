import http from 'http';
import https from 'https';
import type { AddressInfo } from 'net';
import { downloadFile } from './download.util';

// A Telegram file link carries the bot token in its path, so no error may
// quote the URL.
const FILE_PATH = '/file/bot123456:SECRET-token/photos/file_1.jpg';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
}

function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

describe('downloadFile', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects when the connection fails instead of crashing the process', async () => {
    // A port that was just freed: nothing listens there, so it is refused.
    const server = http.createServer();
    const port = await listen(server);
    await close(server);

    const err = await downloadFile(`https://127.0.0.1:${port}${FILE_PATH}`)
      .then(() => null)
      .catch((e: NodeJS.ErrnoException) => e);

    expect(err?.code).toBe('ECONNREFUSED');
    expect(err?.message).not.toContain('SECRET');
  });

  describe('against a local server', () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      server = http.createServer((req, res) => {
        if (req.url === FILE_PATH) {
          res.end('image-bytes');
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html>Not Found</html>');
      });
      port = await listen(server);
      // Plain http stands in for https: the response handling under test is
      // the same, and no TLS certificate is needed.
      jest.spyOn(https, 'get').mockImplementation(http.get as typeof https.get);
    });

    afterEach(() => close(server));

    it('rejects a non-2xx reply instead of returning the error page as the file', async () => {
      const err = await downloadFile(
        `http://127.0.0.1:${port}/file/bot123456:SECRET-token/missing.jpg`,
      )
        .then(() => null)
        .catch((e: Error) => e);

      expect(err?.message).toContain('404');
      expect(err?.message).not.toContain('SECRET');
    });

    it('resolves with the body on 200', async () => {
      await expect(
        downloadFile(`http://127.0.0.1:${port}${FILE_PATH}`),
      ).resolves.toEqual(Buffer.from('image-bytes'));
    });
  });
});
