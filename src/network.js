import os from 'node:os';

export function lanAddresses(interfaces = os.networkInterfaces()) {
  const ignored = /loopback|virtual|vmware|hyper-v|wsl|docker|vethernet|bluetooth/i;
  return Object.entries(interfaces)
    .filter(([name]) => !ignored.test(name))
    .flatMap(([, addresses = []]) => addresses)
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address)
    .filter((address, index, all) => all.indexOf(address) === index);
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
