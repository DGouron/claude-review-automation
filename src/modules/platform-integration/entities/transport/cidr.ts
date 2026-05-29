function ipv4ToInteger(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) {
      return null;
    }
    const part = Number(octet);
    if (part > 255) {
      return null;
    }
    value = value * 256 + part;
  }
  return value >>> 0;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const ipValue = ipv4ToInteger(ip);
  const rangeValue = ipv4ToInteger(rangeIp);
  if (ipValue === null || rangeValue === null) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (rangeValue & mask);
}
