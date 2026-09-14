import os from 'node:os';

const ignoredInterface = /loopback|virtual|vmware|hyper-v|wsl|docker|vethernet|bluetooth/i;
const isPrivate = (address) => /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(address);

export function lanCandidates(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces)
    .flatMap(([name, addresses = []]) => addresses.map((address) => ({ name, ...address })))
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => ({
      name: address.name, address: address.address, private: isPrivate(address.address),
      usable: !ignoredInterface.test(address.name) && !address.address.startsWith('169.254.'),
      reason: ignoredInterface.test(address.name) ? '仮想・補助NIC' : address.address.startsWith('169.254.') ? 'リンクローカル' : null,
    }))
    .filter((candidate, index, all) => all.findIndex((item) => item.address === candidate.address) === index)
    .sort((a, b) => Number(b.usable) - Number(a.usable) || Number(b.private) - Number(a.private) || a.name.localeCompare(b.name));
}

export function lanAddresses(interfaces = os.networkInterfaces()) {
  return lanCandidates(interfaces)
    .filter((candidate) => candidate.usable)
    .map((candidate) => candidate.address);
}

export function accessUrls(port, addresses = lanAddresses()) {
  return {
    local: [`http://localhost:${port}/admin`, `http://localhost:${port}/display`],
    lan: addresses.flatMap((address) => [
      `http://${address}:${port}/admin`,
      `http://${address}:${port}/display`,
    ]),
  };
}

export function connectionInfo(port, interfaces = os.networkInterfaces()) {
  const local = { admin: `http://localhost:${port}/admin`, display: `http://localhost:${port}/display` };
  const candidates = lanCandidates(interfaces).map((candidate) => ({
    ...candidate,
    adminUrl: `http://${candidate.address}:${port}/admin`,
    displayUrl: `http://${candidate.address}:${port}/display`,
  }));
  return { local, candidates };
}
