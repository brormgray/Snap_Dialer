const { Agent, setGlobalDispatcher } = require('undici');
const dns = require('dns');

// Undici dispatcher for fetch
const agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      if (hostname === 'surge.surge.sh') {
        return callback(null, [{ address: '192.241.214.148', family: 4 }]);
      }
      return callback(null, [{ address: '138.197.235.123', family: 4 }]);
    }
  }
});
setGlobalDispatcher(agent);

// Patch DNS for socket connections handling both single and array formats
const origLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname === 'surge.surge.sh' || hostname === 'surge.sh' || hostname.endsWith('.surge.sh') || hostname.endsWith('.surge.io')) {
    const ip = (hostname === 'surge.surge.sh') ? '192.241.214.148' : '138.197.235.123';
    if (options && options.all) {
      return callback(null, [{ address: ip, family: 4 }]);
    }
    return callback(null, ip, 4);
  }
  return origLookup(hostname, options, callback);
};

const surge = require('C:/Users/brorm/AppData/Local/npm-cache/_npx/23158936acd5c32d/node_modules/surge')({
  endpoint: 'https://surge.surge.sh'
});
surge(['./dist', 'valuteachers-dialer.surge.sh', '--endpoint', 'https://surge.surge.sh']);
