import test from 'node:test';
import assert from 'node:assert/strict';
import { accessUrls, connectionInfo, lanAddresses, lanCandidates } from '../src/network.js';

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

test('複数NICを分類し仮想・リンクローカルをQR候補から除外する', () => {
  const interfaces = {
    WiFi: [{ family: 'IPv4', internal: false, address: '192.168.11.5' }],
    Ethernet: [{ family: 'IPv4', internal: false, address: '10.0.0.8' }],
    'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1' }],
    Unknown: [{ family: 'IPv4', internal: false, address: '169.254.1.2' }],
  };
  const candidates = lanCandidates(interfaces);
  assert.deepEqual(candidates.filter((candidate) => candidate.usable).map((candidate) => candidate.address), ['10.0.0.8', '192.168.11.5']);
  assert.equal(candidates.find((candidate) => candidate.address === '172.20.0.1').reason, '仮想・補助NIC');
  assert.equal(candidates.find((candidate) => candidate.address === '169.254.1.2').reason, 'リンクローカル');
  const info = connectionInfo(3000, interfaces);
  assert.equal(info.candidates.find((candidate) => candidate.address === '192.168.11.5').adminUrl, 'http://192.168.11.5:3000/admin');
  assert.equal(info.local.display, 'http://localhost:3000/display');
});
