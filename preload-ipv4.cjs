// Force ALL network connections to use IPv4 only
// This fixes IPv6 routing issues to Telegram API servers

// 1. Patch dns.lookup to prefer IPv4
const dns = require('dns');
const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
    // Handle the case where options is the callback
    if (typeof options === 'function') {
        callback = options;
        options = { family: 4 };
    } else if (typeof options === 'number') {
        options = { family: 4 };
    } else {
        options = { ...options, family: 4 };
    }
    return originalLookup.call(this, hostname, options, callback);
};

// Also patch the promises version
const originalLookupPromises = dns.promises?.lookup;
if (originalLookupPromises) {
    dns.promises.lookup = function(hostname, options) {
        if (typeof options === 'number') {
            options = { family: 4 };
        } else {
            options = { ...options, family: 4 };
        }
        return originalLookupPromises.call(this, hostname, options);
    };
}

// 2. Also set undici global dispatcher for native fetch
const { setGlobalDispatcher, Agent } = require('undici');
const agent = new Agent({ connect: { family: 4 } });
setGlobalDispatcher(agent);

console.log('[preload] Forced all DNS lookups and fetch to use IPv4 only');
