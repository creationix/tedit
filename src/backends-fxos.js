var backends = module.exports = [];
backends.push(require('backends/github'));
backends.push(require('backends/indexed-db'));
