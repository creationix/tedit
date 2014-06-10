var backends = module.exports = [];
backends.push(require('backends/github-clone'));
backends.push(require('backends/indexed-db'));
