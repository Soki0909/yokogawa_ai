import test from 'node:test';
import assert from 'node:assert/strict';
import { accessUrls, lanAddresses } from '../src/network.js';

test('LANアドレスからAdminとDisplayのアクセス情報を生成する', () => {
  const addresses = lanAddresses({
    Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.10.20' }],
    'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1' }],
    Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  });
  assert.deepEqual(addresses, ['192.168.10.20']);
  assert.deepEqual(accessUrls(3100, addresses), {
    local: ['http://localhost:3100/admin', 'http://localhost:3100/display'],
    lan: ['http://192.168.10.20:3100/admin', 'http://192.168.10.20:3100/display'],
  });
});
