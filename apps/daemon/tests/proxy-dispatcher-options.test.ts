import * as platform from '@open-design/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';

const envHttpProxyAgentConstructor = vi.fn();
const socks5ProxyAgentConstructor = vi.fn();

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  class MockEnvHttpProxyAgent {
    constructor(options?: unknown) {
      envHttpProxyAgentConstructor(options);
    }

    async close() {}
  }

  class MockSocks5ProxyAgent {
    constructor(proxyUrl: string) {
      socks5ProxyAgentConstructor(proxyUrl);
    }

    async close() {}
  }

  return {
    ...actual,
    EnvHttpProxyAgent: MockEnvHttpProxyAgent,
    Socks5ProxyAgent: MockSocks5ProxyAgent,
  };
});

describe('proxyDispatcherRequestInit', () => {
  afterEach(() => {
    envHttpProxyAgentConstructor.mockReset();
    socks5ProxyAgentConstructor.mockReset();
    vi.resetModules();
  });

  it('forwards agent timeout options into EnvHttpProxyAgent construction', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit(
        {
          HTTP_PROXY: 'http://proxy.example.test:8080',
        },
        {
          headersTimeout: 10 * 60 * 1000,
          bodyTimeout: 10 * 60 * 1000,
        },
      );

      expect(requestInit.dispatcher).toBeTruthy();
      expect(envHttpProxyAgentConstructor).toHaveBeenCalledWith(expect.objectContaining({
        bodyTimeout: 10 * 60 * 1000,
        headersTimeout: 10 * 60 * 1000,
        httpProxy: 'http://proxy.example.test:8080',
        noProxy: 'localhost,127.0.0.1,[::1]',
      }));
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('uses Socks5ProxyAgent when only ALL_PROXY carries a SOCKS proxy', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5://proxy.example.test:1080',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      expect(socks5ProxyAgentConstructor).toHaveBeenCalledWith('socks5://proxy.example.test:1080');
      expect(envHttpProxyAgentConstructor).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });
});
